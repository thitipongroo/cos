// Equipment Service — Phase 21
// Business logic: equipment CRUD, assignment lifecycle, maintenance logging, utilization recording.
// Status transitions: AVAILABLE → IN_USE → AVAILABLE | AVAILABLE → MAINTENANCE → AVAILABLE
// Emits typed Kafka events via @cos/shared KafkaProducer (QM-8).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { EquipmentRepository } from './equipment.repository';
import type { EquipmentRow, AssignmentRow, MaintenanceRow } from './equipment.repository';
import type { CreateEquipmentDto } from './dto/create-equipment.dto';
import type { AssignEquipmentDto, ReturnEquipmentDto } from './dto/assign-equipment.dto';
import type { LogMaintenanceDto } from './dto/log-maintenance.dto';
import type { RecordUtilizationDto } from './dto/record-utilization.dto';

const logger = createLogger('equipment-service');

const VALID_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['IN_USE', 'MAINTENANCE', 'RETIRED'],
  IN_USE: ['AVAILABLE', 'MAINTENANCE', 'RETIRED'],
  MAINTENANCE: ['AVAILABLE', 'RETIRED'],
  RETIRED: [],
};

@Injectable({ scope: Scope.REQUEST })
export class EquipmentService {
  private readonly kafka: KafkaProducer;

  constructor(
    @Inject(REQUEST) private readonly req: Request,
    private readonly repo: EquipmentRepository,
  ) {
    this.kafka = new KafkaProducer();
  }

  private get tenantId(): string {
    return (this.req as Request & { tenantId: string }).tenantId;
  }

  private get userId(): string {
    return (this.req as Request & { user?: { sub: string } }).user?.sub ?? 'system';
  }

  async createEquipment(dto: CreateEquipmentDto): Promise<EquipmentRow> {
    const equipment = await this.repo.createEquipment({
      equipment_id: randomUUID(),
      tenant_id: this.tenantId,
      equipment_code: dto.equipment_code,
      equipment_name: dto.equipment_name,
      equipment_type: dto.equipment_type,
      purchase_date: dto.purchase_date ?? null,
      purchase_cost: dto.purchase_cost ?? null,
      currency_code: dto.currency_code ?? null,
    });
    logger.info({ equipment_id: equipment.equipment_id }, 'equipment created');
    return equipment;
  }

  async listEquipment(filters: { status?: string; type?: string } = {}): Promise<EquipmentRow[]> {
    return this.repo.findAll(filters);
  }

  async getEquipment(id: string): Promise<EquipmentRow> {
    const eq = await this.repo.findById(id);
    if (!eq) throw new NotFoundException(`Equipment ${id} not found`);
    return eq;
  }

  async updateStatus(id: string, status: string): Promise<EquipmentRow> {
    const eq = await this.getEquipment(id);
    const allowed = VALID_TRANSITIONS[eq.status] ?? [];
    if (!allowed.includes(status)) {
      throw new UnprocessableEntityException(`Cannot transition from ${eq.status} → ${status}`);
    }
    return this.repo.updateStatus(id, status);
  }

  async assignToProject(equipmentId: string, dto: AssignEquipmentDto): Promise<AssignmentRow> {
    const eq = await this.getEquipment(equipmentId);
    if (eq.status !== 'AVAILABLE') {
      throw new UnprocessableEntityException(
        `Equipment is ${eq.status} — only AVAILABLE equipment can be assigned`,
      );
    }

    const assignment = await this.repo.createAssignment({
      assignment_id: randomUUID(),
      equipment_id: equipmentId,
      project_id: dto.project_id,
      tenant_id: this.tenantId,
      assigned_by: this.userId,
      notes: dto.notes ?? null,
    });

    await this.repo.updateStatus(equipmentId, 'IN_USE');

    await this.emitEvent('equipment.unit.assigned.v1', {
      equipment_id: equipmentId,
      project_id: dto.project_id,
      assigned_by: this.userId,
    });

    return assignment;
  }

  async returnFromProject(
    equipmentId: string,
    assignmentId: string,
    _dto: ReturnEquipmentDto,
  ): Promise<AssignmentRow> {
    const assignment = await this.repo.returnAssignment(assignmentId);
    await this.repo.updateStatus(equipmentId, 'AVAILABLE');

    await this.emitEvent('equipment.unit.returned.v1', {
      equipment_id: equipmentId,
      project_id: assignment.project_id,
    });

    return assignment;
  }

  async logMaintenance(equipmentId: string, dto: LogMaintenanceDto): Promise<MaintenanceRow> {
    await this.getEquipment(equipmentId);

    const maintenance = await this.repo.createMaintenance({
      maintenance_id: randomUUID(),
      equipment_id: equipmentId,
      tenant_id: this.tenantId,
      maintenance_type: dto.maintenance_type,
      scheduled_at: dto.scheduled_at,
      cost: dto.cost ?? null,
      currency_code: dto.currency_code ?? null,
      performed_by: dto.performed_by ?? null,
      notes: dto.notes ?? null,
    });

    await this.emitEvent('equipment.unit.maintenance_scheduled.v1', {
      equipment_id: equipmentId,
      scheduled_at: dto.scheduled_at,
    });

    return maintenance;
  }

  async recordUtilization(equipmentId: string, dto: RecordUtilizationDto): Promise<void> {
    await this.getEquipment(equipmentId);
    await this.repo.recordUtilization({
      equipment_id: equipmentId,
      tenant_id: this.tenantId,
      project_id: dto.project_id ?? null,
      recorded_at: dto.recorded_at,
      hours_operated: dto.hours_operated ?? null,
      fuel_consumed: dto.fuel_consumed ?? null,
      operator_id: dto.operator_id ?? null,
    });
  }

  async getEquipmentByProject(projectId: string): Promise<EquipmentRow[]> {
    return this.repo.findEquipmentByProject(projectId);
  }

  private async emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        payload,
      });
    } catch (err) {
      logger.error({ err, eventType }, 'Failed to emit Kafka event — will retry via outbox');
    }
  }
}
