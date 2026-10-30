import { createRemoteRepositories } from './data/supabase.mjs';
import { protectPage } from './auth/protected-page.mjs';
import { createSpoolConsultation } from './ui/spool-consultation.mjs';

const consultation = createSpoolConsultation();
window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});
await protectPage({
  onClear: () => consultation.clear(),
  onReady: async ({ client, session }, isCurrent) => {
    await consultation.load(createRemoteRepositories(client, session), isCurrent);
  },
});
