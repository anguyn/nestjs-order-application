import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nService } from 'nestjs-i18n';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../constants/permissions.constant';
import { getLanguageFromContext } from '../utils/language.util';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly i18n: I18nService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = this.getRequest(context);
    const user = request.user;

    const lang = getLanguageFromContext(context);

    if (!user) {
      throw new ForbiddenException(
        this.i18n.translate('auth.not_authenticated', { lang }),
      );
    }

    const hasPermission = requiredPermissions.some((permission) =>
      user.permissions?.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        this.i18n.translate('auth.insufficient_permissions', { lang }),
      );
    }

    return true;
  }

  private getRequest(context: ExecutionContext) {
    if (context.getType<'graphql'>() === 'graphql') {
      const gqlContext = context.getArgByIndex(2);
      return gqlContext.req;
    }
    return context.switchToHttp().getRequest();
  }
}
