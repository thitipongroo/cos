// Equipment Repository — Phase 21
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).

import { Injectable, Scope } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { applyCap, capLimit } from '../../shared/pagination/list-cap';

export interface EquipmentRow {
  equipment_id: string;
  tenant_id: string;
  equipment_code: string;
  equipment_name: string;
  equipment_type: string;
  status: string;
  purchase_date: Date | null;
  purchase_cost: string | null;
  currency_code: string | null;
  created_at: Date;
}

export interface AssignmentRow {
  assignment_id: string;
  equipment_id: string;
  project_id: string;
  tenant_id: string;
  assigned_by: string;
  assigned_at: Date;
  returned_at: Date | null;
  notes: string | null;
}

export interface MaintenanceRow {
  maintenance_id: string;
  equipment_id: string;
  tenant_id: string;
  maintenance_type: string;
  status: string;
  scheduled_at: Date;
  completed_at: Date | null;
  cost: string | null;
  currency_code: string | null;
  performed_by: string | null;
  notes: string | null;
}

@Injectable({ scope: Scope.REQUEST })
export class EquipmentRepository {
  constructor(private readonly db: TenantPrismaService) {}

  async createEquipment(params: {
    equipment_id: string;
    tenant_id: string;
    equipment_code: string;
    equipment_name: string;
    equipment_type: string;
    purchase_date: string | null;
    purchase_cost: string | null;
    currency_code: string | null;
  }): Promise<EquipmentRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<EquipmentRow[]>`
      INSERT INTO equipment.equipment (
        equipment_id, tenant_id, equipment_code, equipment_name, equipment_type,
        status, purchase_date, purchase_cost, currency_code
      ) VALUES (
        ${params.equipment_id}::uuid, ${params.tenant_id}::uuid,
        ${params.equipment_code}, ${params.equipment_name}, ${params.equipment_type}::equipment.equipment_type_enum,
        'AVAILABLE'::equipment.equipment_status_enum,
        ${params.purchase_date}::date,
        ${params.purchase_cost}::decimal(19,4),
        ${params.currency_code}
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async findAll(filters: { status?: string; type?: string } = {}): Promise<EquipmentRow[]> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<EquipmentRow[]>`
      -- ::text on BOTH sides of each optional filter. Without a cast, an unfiltered list binds an
      -- untyped NULL and PostgreSQL cannot infer the type of "$1 IS NULL" — it answers 42P18
      -- "could not determine data type of parameter $1", so GET /equipment with no query string
      -- failed every time. The unit tests mock Prisma, so this SQL had never reached a server.
      SELECT * FROM equipment.equipment
      WHERE (${filters.status ?? null}::text IS NULL OR status::text = ${filters.status ?? null}::text)
        AND (${filters.type ?? null}::text IS NULL OR equipment_type::text = ${filters.type ?? null}::text)
      ORDER BY created_at DESC
      LIMIT ${capLimit()}
    `,
    );
    return applyCap(rows, 'equipment.equipment');
  }

  async findById(id: string): Promise<EquipmentRow | null> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<EquipmentRow[]>`
      SELECT * FROM equipment.equipment WHERE equipment_id = ${id}::uuid LIMIT 1
    `,
    );
    return rows[0] ?? null;
  }

  async updateStatus(id: string, status: string): Promise<EquipmentRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<EquipmentRow[]>`
      UPDATE equipment.equipment
      SET status = ${status}::equipment.equipment_status_enum
      WHERE equipment_id = ${id}::uuid
      RETURNING *
    `,
    );
    return rows[0];
  }

  async createAssignment(params: {
    assignment_id: string;
    equipment_id: string;
    project_id: string;
    tenant_id: string;
    assigned_by: string;
    notes: string | null;
  }): Promise<AssignmentRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<AssignmentRow[]>`
      INSERT INTO equipment.equipment_assignments (
        assignment_id, equipment_id, project_id, tenant_id, assigned_by, assigned_at, notes
      ) VALUES (
        ${params.assignment_id}::uuid, ${params.equipment_id}::uuid,
        ${params.project_id}::uuid, ${params.tenant_id}::uuid,
        ${params.assigned_by}::uuid, now(), ${params.notes}
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async returnAssignment(assignmentId: string): Promise<AssignmentRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<AssignmentRow[]>`
      UPDATE equipment.equipment_assignments
      SET returned_at = now()
      WHERE assignment_id = ${assignmentId}::uuid
      RETURNING *
    `,
    );
    return rows[0];
  }

  async createMaintenance(params: {
    maintenance_id: string;
    equipment_id: string;
    tenant_id: string;
    maintenance_type: string;
    scheduled_at: string;
    cost: string | null;
    currency_code: string | null;
    performed_by: string | null;
    notes: string | null;
  }): Promise<MaintenanceRow> {
    const rows = await this.db.run(
      (tx) => tx.$queryRaw<MaintenanceRow[]>`
      INSERT INTO equipment.equipment_maintenance (
        maintenance_id, equipment_id, tenant_id, maintenance_type, status,
        scheduled_at, cost, currency_code, performed_by, notes
      ) VALUES (
        ${params.maintenance_id}::uuid, ${params.equipment_id}::uuid,
        ${params.tenant_id}::uuid, ${params.maintenance_type}::equipment.maintenance_type_enum,
        'PENDING'::equipment.maintenance_status_enum,
        ${params.scheduled_at}::timestamptz,
        ${params.cost}::decimal(19,4), ${params.currency_code},
        ${params.performed_by}, ${params.notes}
      )
      RETURNING *
    `,
    );
    return rows[0];
  }

  async recordUtilization(params: {
    equipment_id: string;
    tenant_id: string;
    project_id: string | null;
    recorded_at: string;
    hours_operated: number | null;
    fuel_consumed: number | null;
    operator_id: string | null;
  }): Promise<void> {
    await this.db.run(
      (tx) => tx.$queryRaw`
      INSERT INTO equipment_telemetry.equipment_utilization (
        recorded_at, equipment_id, tenant_id, project_id,
        hours_operated, fuel_consumed, operator_id
      ) VALUES (
        ${params.recorded_at}::timestamptz,
        ${params.equipment_id}::uuid, ${params.tenant_id}::uuid,
        ${params.project_id}::uuid,
        ${params.hours_operated}::decimal(5,2),
        ${params.fuel_consumed}::decimal(8,2),
        ${params.operator_id}::uuid
      )
      ON CONFLICT (tenant_id, equipment_id, recorded_at) DO NOTHING
    `,
    );
  }

  async findEquipmentByProject(projectId: string): Promise<EquipmentRow[]> {
    return this.db.run(
      (tx) => tx.$queryRaw<EquipmentRow[]>`
      SELECT e.*
      FROM equipment.equipment e
      JOIN equipment.equipment_assignments a ON a.equipment_id = e.equipment_id
      WHERE a.project_id = ${projectId}::uuid
        AND a.returned_at IS NULL
      ORDER BY e.equipment_name
    `,
    );
  }
}
