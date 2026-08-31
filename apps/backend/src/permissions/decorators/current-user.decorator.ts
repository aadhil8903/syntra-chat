import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IUser } from '@enter-chat/shared-types';

export const CurrentUser = createParamDecorator(
  (data: keyof IUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);

