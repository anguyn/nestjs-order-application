import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthenticatedUser } from '../types/common.types';
import { getLanguageFromContext } from '../utils/language.util';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): AuthenticatedUser => {
    if (context.getType<'graphql'>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext().req.user;
    }

    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);

export const GetLanguage = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    return getLanguageFromContext(context);
  },
);
