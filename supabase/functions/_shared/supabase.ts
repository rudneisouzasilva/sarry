import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Exige usuário autenticado no Supabase E cadastrado como morador da casa
// "sub" do JWT sem validar a assinatura (a validação é feita pelo auth.getUser em paralelo)
function jwtSubject(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

// Moradores já conferidos, para não consultar a tabela a cada comando
const MEMBER_TTL_MS = 5 * 60_000;
const memberSeen = new Map<string, number>();

export async function requireMember(req: Request, db: SupabaseClient): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Faça login para continuar');
  // valida a sessão e consulta o morador ao mesmo tempo (o id vem do próprio token e é conferido depois)
  const claimedId = jwtSubject(jwt);
  const known = claimedId && (memberSeen.get(claimedId) ?? 0) > Date.now();
  const [{ data, error }, memberRes] = await Promise.all([
    db.auth.getUser(jwt),
    known || !claimedId ? null : db.from('members').select('user_id').eq('user_id', claimedId).maybeSingle(),
  ]);
  if (error || !data.user) throw new HttpError(401, 'Sessão inválida, entre novamente');
  let isMember = known && data.user.id === claimedId;
  if (!isMember) {
    const res =
      memberRes && data.user.id === claimedId
        ? memberRes
        : await db.from('members').select('user_id').eq('user_id', data.user.id).maybeSingle();
    isMember = Boolean(res.data);
  }
  if (!isMember) throw new HttpError(403, 'Sua conta ainda não foi liberada como moradora desta casa');
  memberSeen.set(data.user.id, Date.now() + MEMBER_TTL_MS);
  return data.user;
}
