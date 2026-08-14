import { Server as HttpServer } from 'http';

export const resolvePort = (rawPort: string | undefined, fallbackPort: number): number => {
  const parsedPort = Number(rawPort);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return fallbackPort;
  }
  return parsedPort;
};

export const listenWithFallback = async (
  httpServer: HttpServer,
  host: string,
  startPort: number,
  maxAttempts = 10
): Promise<number> => {
  let currentPort = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          httpServer.off('listening', onListening);
          reject(error);
        };

        const onListening = () => {
          httpServer.off('error', onError);
          resolve();
        };

        httpServer.once('error', onError);
        httpServer.once('listening', onListening);
        httpServer.listen(currentPort, host);
      });

      return currentPort;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) {
        throw error;
      }

      console.warn(`Port ${currentPort} is already in use. Trying ${currentPort + 1}...`);
      currentPort += 1;
    }
  }

  throw new Error('No available port found in allowed retry range.');
};
