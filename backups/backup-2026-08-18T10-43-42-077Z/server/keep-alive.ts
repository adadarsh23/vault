import http from 'http';
import https from 'https';

interface KeepAliveOptions {
  serviceId?: string;
  enabled?: boolean;
  silentWhenDisabled?: boolean;
}

export interface KeepAliveState {
  enabled: boolean;
  target: string | null;
}

/**
 * Pings the server's own public URL to prevent Render Free tier from spinning down.
 * @param url The public URL of the server (e.g., https://my-vault-cic6.onrender.com)
 * @param intervalMinutes How often to ping (Default: 13 mins, Render has a 15 min idle timeout)
 */
export function startKeepAlive(
  url: string | undefined,
  intervalMinutes = 13,
  options: KeepAliveOptions = {}
): KeepAliveState {
  const serviceSuffix = options.serviceId ? ` for service ${options.serviceId}` : '';
  const isEnabled = options.enabled ?? process.env.NODE_ENV === 'production';

  if (!isEnabled) {
    if (!options.silentWhenDisabled) {
      console.log(`Keep-alive disabled${serviceSuffix}.`);
    }
    return { enabled: false, target: null };
  }

  if (!url) {
    console.warn(`Keep-alive warning: No public URL provided${serviceSuffix}. Skipping self-ping.`);
    return { enabled: false, target: null };
  }

  const targetUrl = new URL(url.endsWith('/') ? `${url}health` : `${url}/health`);
  const client = targetUrl.protocol === 'http:' ? http : https;

  console.log(
    `[Keep-Alive] Initializing self-ping for ${targetUrl.toString()} every ${intervalMinutes} minutes${serviceSuffix}...`
  );

  const ping = () => {
    const request = client.get(targetUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`[Keep-Alive] Ping successful: ${new Date().toISOString()}`);
      } else {
        console.warn(`[Keep-Alive] Ping returned status code: ${res.statusCode}`);
      }
      res.resume();
    });

    request.on('error', (err) => {
      console.error(`[Keep-Alive] Ping error: ${err.message}`);
    });
  };

  // Run immediately on start
  ping();

  // Schedule regular pings
  const timer = setInterval(ping, intervalMinutes * 60 * 1000);
  timer.unref();

  return { enabled: true, target: targetUrl.toString() };
}
