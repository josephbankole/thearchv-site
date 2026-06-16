// Partnerships form via Web3Forms (static, no backend). The access key is public-safe by
// design: it only routes mail to the address the founder verified at web3forms.com.
// To activate: create a key at https://web3forms.com (enter your destination email),
// then set it in index.html as  <meta name="web3forms-key" content="YOUR-KEY">  or replace below.
import { track } from '../analytics';

const FALLBACK_KEY = 'REPLACE_WITH_WEB3FORMS_ACCESS_KEY';
const ENDPOINT = 'https://api.web3forms.com/submit';

function getKey(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="web3forms-key"]');
  return meta?.content?.trim() || FALLBACK_KEY;
}

export function initContactForm(): void {
  const form = document.getElementById('partner-form') as HTMLFormElement | null;
  const status = document.getElementById('form-status');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'form__status';
    status.textContent = '';

    // honeypot
    if ((form.elements.namedItem('botcheck') as HTMLInputElement)?.value) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const key = getKey();
    if (key === FALLBACK_KEY) {
      // Form intentionally dormant: route enquiries to Instagram DMs for now.
      status.className = 'form__status is-ok';
      status.textContent = 'Thank you. For partnerships, message us on Instagram @thearchv_ca and we will pick it up.';
      track('partnership_intent', {});
      return;
    }

    const data = new FormData(form);
    const payload = {
      access_key: key,
      subject: 'New partnership enquiry — thearchv.ca',
      from_name: 'The ARCHV site',
      name: data.get('name'),
      company: data.get('company'),
      email: data.get('email'),
      replyto: data.get('email'),
      message: data.get('message'),
    };

    const btn = form.querySelector<HTMLButtonElement>('.form__submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        status.className = 'form__status is-ok';
        status.textContent = 'Thank you. We will be in touch.';
        track('partnership_submit', {});
        form.reset();
      } else {
        throw new Error(json.message || 'Request failed');
      }
    } catch {
      status.className = 'form__status is-err';
      status.textContent = 'Something went wrong. Email us instead and we will pick it up.';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send partnership enquiry'; }
    }
  });
}
