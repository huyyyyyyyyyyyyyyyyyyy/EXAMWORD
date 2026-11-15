import { createSiteContext, createDatabaseClient, errorResponse } from './_qoder/backend.mjs';
import { createStorageClient } from './_qoder/storage.mjs';
import { application } from './routes.mjs';

// forwardApplicationCredentials keeps our own Bearer Authorization header intact.
const handle = application({ db: createDatabaseClient(), storage: createStorageClient() });

Deno.serve(async (request) => {
  let context;
  try {
    context = createSiteContext(request, { forwardApplicationCredentials: true });
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});