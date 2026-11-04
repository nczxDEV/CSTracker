import { LinkedAccountPublicView } from './models/linked-account.model';

/** `GET /auth/status` response shape - what the Control Panel's Account tab polls after clicking "Login with ...". */
export interface AuthStatusResponse {
  capabilities: { steam: boolean; faceit: boolean };
  faceit: LinkedAccountPublicView | null;
  steam: LinkedAccountPublicView | null;
}
