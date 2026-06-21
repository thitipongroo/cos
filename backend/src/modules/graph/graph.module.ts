// Graph Module — Phase 13
// NestJS thin API that delegates all queries to Neo4j.
// Source: context/00_master_construction_os.md §Phase 13 Graph APIs
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import neo4j, { Driver } from 'neo4j-driver';
import { GraphController } from './graph.controller';
import { GraphService } from './graph.service';
import { NEO4J_DRIVER } from './graph.tokens';

export { NEO4J_DRIVER };

@Module({
  imports: [ConfigModule],
  controllers: [GraphController],
  providers: [
    {
      provide: NEO4J_DRIVER,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Driver =>
        neo4j.driver(
          cfg.getOrThrow<string>('NEO4J_URI'),
          neo4j.auth.basic(
            cfg.getOrThrow<string>('NEO4J_USERNAME'),
            cfg.getOrThrow<string>('NEO4J_PASSWORD'),
          ),
        ),
    },
    GraphService,
  ],
  exports: [GraphService],
})
export class GraphModule {}
