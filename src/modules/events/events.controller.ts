import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { EditLocksService } from '../edit-locks/edit-locks.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import {
  CreateEventDto,
  UpdateEventDto,
  QueryEventsDto,
} from './dto/events.dto';

@ApiTags('Events')
@Controller('events')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly editLocksService: EditLocksService,
  ) {}

  @Get()
  @Permissions(Permission.EVENT_READ)
  @ApiOperation({ summary: 'Get all events' })
  async getAllEvents(@Query() query: QueryEventsDto) {
    return this.eventsService.getEvents(query);
  }

  @Post()
  @Permissions(Permission.EVENT_CREATE)
  @ApiOperation({ summary: 'Create new event' })
  async createEvent(
    @Body() dto: CreateEventDto,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.eventsService.createEvent(dto, user.id, lang);
  }

  @Get('my-events')
  @Permissions(Permission.EVENT_READ)
  @ApiOperation({ summary: 'Get my events' })
  async getMyEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryEventsDto,
  ) {
    return this.eventsService.getUserEvents(user.id, query);
  }

  @Get(':eventId')
  @Permissions(Permission.EVENT_READ)
  @ApiOperation({ summary: 'Get event by ID' })
  async getEventById(
    @Param('eventId') eventId: string,
    @GetLanguage() lang: string,
  ) {
    return this.eventsService.getEventById(eventId, lang);
  }

  @Put(':eventId')
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Update event' })
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.eventsService.updateEvent(
      eventId,
      dto,
      user.id,
      user.email,
      lang,
    );
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.EVENT_DELETE)
  @ApiOperation({ summary: 'Delete event' })
  async deleteEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    await this.eventsService.deleteEvent(eventId, user.id, lang);
    return { message: 'Event deleted successfully' };
  }

  @Post(':eventId/lock')
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Acquire edit lock' })
  async acquireLock(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.editLocksService.acquireLock(
      'event',
      eventId,
      user.id,
      user.email,
      lang,
    );
  }

  @Post(':eventId/unlock')
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Release edit lock' })
  async releaseLock(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    await this.editLocksService.releaseLock('event', eventId, user.id, lang);
    return { message: 'Lock released successfully' };
  }

  @Post(':eventId/maintain-lock')
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Maintain edit lock' })
  async maintainLock(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.editLocksService.maintainLock('event', eventId, user.id, lang);
  }
}
