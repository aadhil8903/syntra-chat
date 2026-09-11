import { Module, Global } from '@nestjs/common';
import { MessagesEventsService } from '../messages/messages-events.service';

@Global()
@Module({
  providers: [MessagesEventsService],
  exports: [MessagesEventsService],
})
export class EventsModule {}
