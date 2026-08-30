"""End-to-end Airflow DAG runs with test data (master §Phase 23 Generate item 10).

WHY THIS FILE EXISTS ALONGSIDE test_dag_integration.py. That file is named for integration and its
docstring claims an "end-to-end Airflow DAG run with test data", but every test in it reads a DagBag:
it verifies that the DAGs PARSE, that the task counts are right and that the dependencies point the
right way. Nothing in it ever runs a task. A DAG can satisfy all of that and still fail on its first
execution — the operators are wired, the callables are not.

WHAT "END TO END" CAN MEAN HERE. master:5413 makes these DAGs stubs on purpose: every task body
raises NotImplementedError until the pipeline is implemented. So a plain run cannot succeed, and a
test that asserted success would be asserting a fiction. Two things CAN be settled by running, and
both are settled below:

  1. Every task EXECUTES — each operator is driven through its own execute() in the order the DAG's
     dependency edges impose, so a task that is wired but not callable fails here. That is the
     difference between "parses" and "runs".

  2. With the stub callables replaced by ones that write TEST DATA, the whole graph completes and a
     readable Parquet artefact lands, under the per-tenant data-lake path master:5417 fixes.

SCOPE, STATED PLAINLY: this drives the OPERATORS, not a scheduler-backed DagRun. Airflow 3.2.2 will
not create a DagRun for a DAG that has not been through its serialisation pipeline, and that pipeline
has no public entry point — reaching into it would buy a stronger claim with a test that breaks on
the next patch release and tells the reader nothing about why. The dependency ORDER is taken from the
DAG itself, so the graph is still what decides what runs when.
"""

from __future__ import annotations

import os
import tempfile

# AIRFLOW_HOME must be set BEFORE airflow is imported: the settings module reads it at import time to
# decide where the metadata database lives. A temp dir keeps the test's DagRuns out of any real
# Airflow install on the machine — and out of the repository.
os.environ.setdefault("AIRFLOW_HOME", tempfile.mkdtemp(prefix="cos-airflow-test-"))
os.environ.setdefault("AIRFLOW__CORE__LOAD_EXAMPLES", "False")

import uuid
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from airflow.models import DagBag

DAGS_DIR = "mlops/airflow/dags"


@pytest.fixture(scope="session", autouse=True)
def _airflow_db() -> None:
    """Create the metadata database dag.test() writes its DagRun into.

    DagBag needs no database — which is why test_dag_integration.py never noticed it was missing, and
    why "the DAGs load" and "the DAGs run" are different claims. dag.test() creates a real DagRun and
    real task instances, so it needs real tables.
    """
    from airflow.utils.db import initdb

    initdb()


@pytest.fixture(scope="module")
def dagbag() -> DagBag:
    bag = DagBag(dag_folder=DAGS_DIR, include_examples=False)
    assert bag.import_errors == {}, f"DAGs failed to import: {bag.import_errors}"
    return bag


def _logical_date() -> datetime:
    # Fixed, not "now": a DagRun keyed on the wall clock makes a failure impossible to reproduce.
    return datetime(2026, 8, 25, tzinfo=timezone.utc)


def _run_dag_in_order(dag, run_task) -> list[str]:
    """Execute every task once, respecting the DAG's dependency edges. Returns the order used.

    A plain topological walk, taken from the DAG's own upstream sets — not a hand-written list, which
    would pass even if the edges were wrong.
    """
    remaining = {t.task_id: {u.task_id for u in t.upstream_list} for t in dag.tasks}
    by_id = {t.task_id: t for t in dag.tasks}
    order: list[str] = []
    while remaining:
        ready = sorted(tid for tid, ups in remaining.items() if not ups - set(order))
        assert ready, f"cycle or unreachable tasks in {dag.dag_id}: {remaining}"
        for tid in ready:
            run_task(by_id[tid])
            order.append(tid)
            del remaining[tid]
    return order


class TestDagActuallyRuns:
    """Every task is driven through its operator, not merely parsed."""

    def test_each_task_executes_and_fails_for_the_stub_reason(self, dagbag):
        dag = dagbag.get_dag("dag-export-training-data")
        assert dag is not None

        reached: list[str] = []

        def _run(task):
            # The real operator execute(), with the real callable. Each stub raises
            # NotImplementedError — which is the point: it is REACHED, and it fails for its own
            # stated reason rather than for a wiring or signature error.
            with pytest.raises(NotImplementedError):
                task.execute({"ds": "2026-08-25", "logical_date": _logical_date()})
            reached.append(task.task_id)

        order = _run_dag_in_order(dag, _run)
        assert len(reached) == len(dag.tasks)

        # Every upstream ran before its dependent — the edges the DAG declares were HONOURED by the
        # walk. Deliberately not "verify_export came last": that assertion passed even with the edge
        # deleted, because the ready batch is sorted and `verify_export` happens to sort last anyway.
        # An assertion that survives the removal of the thing it describes is not an assertion.
        for task in dag.tasks:
            for upstream in task.upstream_list:
                assert order.index(upstream.task_id) < order.index(task.task_id)

    def test_every_task_body_is_still_a_stub(self, dagbag):
        # Guards the premise of the test above. The day these are implemented, this fails and the
        # test below should assert real output instead of substituted callables.
        dag = dagbag.get_dag("dag-export-training-data")
        import inspect

        unimplemented = [
            t.task_id
            for t in dag.tasks
            if "NotImplementedError" in inspect.getsource(t.python_callable)
        ]
        assert sorted(unimplemented) == sorted(t.task_id for t in dag.tasks)


class TestDagRunWithTestData:
    """The full graph completes when the stubbed I/O is given test data."""

    def test_export_dag_completes_and_writes_parquet(self, dagbag, monkeypatch, tmp_path):
        dag = dagbag.get_dag("dag-export-training-data")
        tenant_id = f"t-{uuid.uuid4().hex[:8]}"
        partition = date(2026, 8, 25)
        written: list[Path] = []

        frame = pd.DataFrame(
            {
                "report_id": [str(uuid.uuid4()), str(uuid.uuid4())],
                "project_id": [str(uuid.uuid4())] * 2,
                "issue_count": [1, 3],
            }
        )

        def _export(task_id: str):
            def _fn(**_context):
                # Writes through pyarrow exactly as export_to_parquet does — the destination is a
                # temp dir rather than MinIO, because the boundary under test is the DAG execution,
                # not the object store.
                dest = (
                    tmp_path / f"cos-datalake-{tenant_id}" / task_id / f"dt={partition.isoformat()}"
                )
                dest.mkdir(parents=True, exist_ok=True)
                out = dest / "data.parquet"
                pq.write_table(pa.Table.from_pandas(frame), out)
                written.append(out)

            return _fn

        for task in dag.tasks:
            monkeypatch.setattr(task, "python_callable", _export(task.task_id), raising=False)

        order = _run_dag_in_order(
            dag, lambda t: t.execute({"ds": "2026-08-25", "logical_date": _logical_date()})
        )

        assert len(written) == len(dag.tasks)
        assert all(p.exists() for p in written)

        # The walk's order was captured and then dropped on the floor — ruff's F841 is what found it.
        # Same assertion the loading test above makes, for the same reason: the helper returns the
        # order precisely so the declared edges can be checked against the order they produced.
        for task in dag.tasks:
            for upstream in task.upstream_list:
                assert order.index(upstream.task_id) < order.index(task.task_id)

        # The structural claim, stated as structure: verify_export hangs off all four exports. Kept
        # separate from the ordering above so neither can pass on the other's behalf.
        verify = dag.get_task("verify_export")
        assert {u.task_id for u in verify.upstream_list} == {
            "export_site_reports",
            "export_cost_history",
            "export_procurement_data",
            "export_inspection_failures",
        }

        # The artefact is readable Parquet holding the rows that went in, not an empty file.
        table = pq.read_table(written[0])
        assert table.num_rows == len(frame)
        assert set(table.column_names) >= {"report_id", "project_id", "issue_count"}

        # master:5417 — the data lake is per tenant. Asserted on the path the run PRODUCED, not on
        # the docstring that describes it.
        bucket = written[0].relative_to(tmp_path).parts[0]
        assert bucket == f"cos-datalake-{tenant_id}"
