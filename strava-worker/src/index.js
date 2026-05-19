/**
 * Cloudflare Worker — Strava OAuth Token Proxy
 * Protege el client_secret de Strava del lado del cliente.
 *
 * Variables de entorno requeridas (configuradas en Cloudflare Dashboard o via wrangler secret):
 *   STRAVA_CLIENT_ID     — Tu Client ID de Strava
 *   STRAVA_CLIENT_SECRET — Tu Client Secret de Strava
 *   ALLOWED_ORIGIN       — URL de tu app (ej: https://gymtracker-b6d6b.web.app)
 */

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export default {
    async fetch(request, env) {
        // ── CORS preflight ────────────────────────────────────────
        if (request.method === 'OPTIONS') {
            return corsResponse(null, 204, env);
        }

        const url = new URL(request.url);

        // ── Ruta: POST /strava/token ───────────────────────────────
        if (request.method === 'POST' && url.pathname === '/strava/token') {
            return handleTokenExchange(request, env);
        }

        // ── Ruta: POST /strava/refresh ─────────────────────────────
        if (request.method === 'POST' && url.pathname === '/strava/refresh') {
            return handleTokenRefresh(request, env);
        }

        return corsResponse({ error: 'Not found' }, 404, env);
    }
};

// ── Intercambio de código de autorización por tokens ──────────────
async function handleTokenExchange(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return corsResponse({ error: 'Invalid JSON body' }, 400, env);
    }

    const { code } = body;
    if (!code) {
        return corsResponse({ error: 'Missing "code" parameter' }, 400, env);
    }

    const stravaRes = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code,
            grant_type:    'authorization_code'
        })
    });

    const data = await stravaRes.json();

    if (!stravaRes.ok) {
        return corsResponse({ error: 'Strava error', details: data }, stravaRes.status, env);
    }

    // Solo devolvemos los campos necesarios, nunca exponemos el client_secret
    return corsResponse({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
        athlete:       data.athlete
    }, 200, env);
}

// ── Renovación de token expirado ──────────────────────────────────
async function handleTokenRefresh(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return corsResponse({ error: 'Invalid JSON body' }, 400, env);
    }

    const { refresh_token } = body;
    if (!refresh_token) {
        return corsResponse({ error: 'Missing "refresh_token" parameter' }, 400, env);
    }

    const stravaRes = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id:     env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            refresh_token,
            grant_type:    'refresh_token'
        })
    });

    const data = await stravaRes.json();

    if (!stravaRes.ok) {
        return corsResponse({ error: 'Strava refresh error', details: data }, stravaRes.status, env);
    }

    return corsResponse({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at
    }, 200, env);
}

// ── Helper: respuesta JSON con cabeceras CORS ─────────────────────
function corsResponse(body, status = 200, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const headers = {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods':'POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type'
    };
    return new Response(body ? JSON.stringify(body) : null, { status, headers });
}
