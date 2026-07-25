// Phase 3: Project Service
// REQUEST-scoped because ProjectService and ProjectRepository depend on
// per-request tenant context (TenantPrismaService is also REQUEST-scoped).

import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ProjectRepository } from './project.repository';
import { TenantModule } from '../tenant/tenant.module';
// Phase 3 spatial hierarchy + asset/unit entities (§10.2 / §11.2). Full CRUD, no Kafka events.
import { BuildingsController } from './buildings/buildings.controller';
import { BuildingsService } from './buildings/buildings.service';
import { BuildingsRepository } from './buildings/buildings.repository';
import { FloorsController } from './floors/floors.controller';
import { FloorsService } from './floors/floors.service';
import { FloorsRepository } from './floors/floors.repository';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';
import { RoomsRepository } from './rooms/rooms.repository';
import { StructuresController } from './structures/structures.controller';
import { StructuresService } from './structures/structures.service';
import { StructuresRepository } from './structures/structures.repository';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { UnitsRepository } from './units/units.repository';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';
import { AssetsRepository } from './assets/assets.repository';
// Project phases — construction execution-stage tracking (ADR-070). CRUD subset, no Kafka events.
import { PhasesController } from './phases/phases.controller';
import { PhasesService } from './phases/phases.service';
import { PhasesRepository } from './phases/phases.repository';
// Project risk register (ADR-065). CRUD + status, emits RiskRaised / RiskStatusChanged.
import { RisksController } from './risks/risks.controller';
import { RisksService } from './risks/risks.service';
import { RisksRepository } from './risks/risks.repository';
// F4b feed: consumes ai.risk_prediction.generated.v1 → AI_SUGGESTED ProjectRisk.
import { RisksConsumer } from './risks/risks.consumer';

@Module({
  imports: [TenantModule],
  controllers: [
    ProjectController,
    BuildingsController,
    FloorsController,
    RoomsController,
    StructuresController,
    UnitsController,
    AssetsController,
    PhasesController,
    RisksController,
  ],
  providers: [
    ProjectService,
    ProjectRepository,
    BuildingsService,
    BuildingsRepository,
    FloorsService,
    FloorsRepository,
    RoomsService,
    RoomsRepository,
    StructuresService,
    StructuresRepository,
    UnitsService,
    UnitsRepository,
    AssetsService,
    AssetsRepository,
    PhasesService,
    PhasesRepository,
    RisksService,
    RisksRepository,
    RisksConsumer,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
