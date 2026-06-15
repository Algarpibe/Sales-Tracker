-- Backlog real: añade el valor 'BACKLOG' al enum record_type.
-- sales_records pasa a almacenar, además de SALES_ORDER e INVOICE, filas BACKLOG
-- (pendiente de facturar por orden, calculado por el transform vía invoiced_status
-- de Zoho). Cambio aditivo y no destructivo. Ya aplicado en prod 2026-06-14.

ALTER TYPE record_type ADD VALUE IF NOT EXISTS 'BACKLOG';
