// The backend's route to the AI Gateway (TDD OQ-46). Controller only — it holds no state and owns
// no data; see ai-proxy.controller.ts for why the route lives here rather than at an edge gateway.

import { Module } from '@nestjs/common';
import { AiProxyController } from './ai-proxy.controller';

@Module({
  controllers: [AiProxyController],
})
export class AiProxyModule {}
