import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiGatewayService } from './ai-gateway.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AiGatewayService],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}

