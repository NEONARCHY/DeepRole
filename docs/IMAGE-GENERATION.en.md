# Images in DeepRole

An optional feature for story illustrations. Off by default. DeepRole does not analyze or rewrite prompts: the provider decides whether to accept a request. The presets Ordinary images, Non-explicit romance and Explicit scenes · 18+ differ only in the connection and labels they select.

## Connect an API

Open **Settings → Images**. Enter a name, your API address and its format. DeepRole has no built-in provider, model inventory, prices or tariffs. Save your key separately, grant access to that address, enable the connection and load models. Select a model, save the connection and assign it to a settings preset.

Presets only select the connection and labels. They do not trigger text analysis or secretly change request parameters. One entry in `IMAGE_CONTENT_LEVELS` defines a new preset's type, validation and both translations. The Explicit scenes · 18+ preset is stored only together with the age confirmation in the same section; without it the preset is not saved and no request is sent for it.

How adult content is handled is decided by your provider and your local law, not by DeepRole. Many APIs blur adult results through a service parameter that is on by default, and a host's filters can refuse even an uncensored model. The extension reports such a refusal in plain words and does not try to bypass it. Characters must be fictional; real people are not allowed.

Additional parameters are a JSON object, up to 32 fields and 32,000 characters. Unknown fields are preserved and transmitted unchanged, without a parameter allowlist. Transport-owned `model`, `modelId`, `prompt`, `image`, `images`, authorization and headers cannot be overridden: the entire configuration is rejected, not silently repaired. Documented parameters of a particular model, including its own service flags, are supplied by the extension owner, this field included. A JSON seed is passed literally; if a fixed character seed is also set, the request is rejected before sending rather than overwriting either value. No new dependencies are required.

The key is in a separate `storage.local` record, **not encrypted by the vault**. Our background code uses it; our DeepSeek page code does not read it. Only the last four characters are shown. Keys and connection settings are excluded from backups and world packages: configure them again on another computer. HTTPS is required except for localhost HTTP.

## Create an illustration

The button beside a completed reply opens an editor. Review the description before sending. Stable appearance is inserted verbatim; scene, clothing, pose, light and mood are separate. Style and seed can be saved for a character without changing lore. Any uploaded character image can be a reference. Only the **final description, selected references and parameters** go to the provider, not the entire chat or library. A separately requested DeepSeek scene description receives scene text, appearance and the usual connected context, never image bytes or API keys; its wording follows the selected preset.

Each generation or regeneration click may incur a charge. There is no automatic generation or retry, including after 429. A timed-out request may already have been processed: check charges before retrying. Results become JPEG, at most 768 px on the longest edge and 300,000 encoded characters. References are reduced to at most 1.5 million pixels and less than 10 MB.

Illustrations are separate from portraits, bound to a particular reply, and included in full backups and world exports. World packages preserve original chat associations as an archive; images are not rebound to a similarly named turn in a new chat. A world can hold up to 60 illustrations; its combined image budget, including portraits and selfies, is 50 MB in local encoded storage. Overflow never deletes existing data. Deleting an illustration does not edit lore or the sent reply. The vault protects illustration records alongside the library.

If the result links to a different host, a finished-image download button opens a separate extension tab to grant that host access. This downloads an existing file; it **does not regenerate it**. The temporary association lasts up to 15 minutes in session storage and is encrypted when the vault is enabled.

## Verified API formats

Contracts checked October 8, 2026, against the live model catalogue. These names describe adapter protocols, not built-in provider connections.

- OpenAI Images: [generation](https://developers.openai.com/api/reference/resources/images/methods/generate) and [JSON editing](https://developers.openai.com/api/reference/resources/images/methods/edit). References use data URLs in `images[].image_url`; responses contain JSON base64 or a URL. The [model list](https://developers.openai.com/api/reference/resources/models/methods/list) does not provide image prices or capabilities. TODO: a documented metadata extension; unknown values are not invented.
- Venice native: [generation](https://docs.venice.ai/api-reference/endpoint/image/generate) returns JSON `images[]` or its documented binary mode; [single edit](https://docs.venice.ai/api-reference/endpoint/image/edit) and [multi-edit](https://docs.venice.ai/api-reference/endpoint/image/multi-edit) return raw image bytes. Multi-edit sends JSON data URLs. **Single edit uses documented raw base64 in JSON**; data-URL support for that separate route is unconfirmed, with a TODO pending clarification.
- The [Venice model list](https://docs.venice.ai/api-reference/endpoint/models/list) is read from the API, including price, privacy, prompt limit and the uncensored flag. Venice does not keep its price in one field: generation and editing nest it per mode (`pricing.inpaint.usd`, `pricing.resolutions.1K.usd`), so DeepRole takes the lowest documented amount for a model and invents nothing when the API reports none. Whether an edit model accepts several references arrives as the `constraints.combineImages` flag rather than a number; the documented multi-edit maximum is three input images and DeepRole never claims more. Edit models come from the `type=inpaint` request, ordinary generation from `type=image`.

Compatible APIs must support the chosen protocol. An API requiring multipart instead of JSON or another endpoint is not guessed. Models may ignore seed or vary a character's appearance; references help but cannot guarantee identity.

## Errors and server information

401: key; 402: balance; 403: refusal; 415: format; 429: wait; 500: provider failure; 503: busy model. Errors never regenerate automatically. Response headers `x-venice-is-blurred`, `x-venice-is-content-violation`, and `x-venice-model-deprecation-warning` are preserved and displayed with explanations: when the provider blurred an image or refused under its own rules, DeepRole says so plainly instead of showing a puzzling result. Missing API prices, edit capabilities or limits are not invented; the initial reference-count fallback is 1.

TODO: an `INSUFFICIENT_BALANCE` code outside HTTP 402 and a payment link in an error body require a confirmed response schema. Currently HTTP 402 produces the balance message; payment URLs are not invented and raw error bodies are not exposed.

A rebuild does not reload an installed extension. Save open edits, replace the installed copy's files, reload DeepRole on the extensions page, and refresh DeepSeek.

## Verification

Stage one: skeleton, separate storage, interface, strict validation, quotas and export. Stage two: network adapters, live API models and JSON/binary results. Each stage separately runs TypeScript and the full unit/integration suite. Automated tests mock external requests. Paid generation is not claimed verified without a key and an agreed budget.
