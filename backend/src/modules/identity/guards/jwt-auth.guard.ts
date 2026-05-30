import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Validates Keycloak RS256 JWT on every protected endpoint. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('keycloak-jwt') {}
