-- Rollback for 20260716000002_pr_line_items.
-- DESTRUCTIVE: drops what every purchase request was asking for. Requests themselves survive in
-- procurement.purchase_requests, but they go back to recording only that a request exists.

DROP TABLE IF EXISTS procurement.pr_line_items;
