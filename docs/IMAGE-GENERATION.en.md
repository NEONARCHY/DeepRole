# Images in DeepRole

An optional feature for story illustrations. Off by default. DeepSeek prepares a visual description of the requested scene; the image provider decides whether to accept it. The presets Ordinary images, Non-explicit romance and Explicit scenes · 18+ differ only in the connection and labels they select.

## Where to get images and an API

There are two independent paths: **upload ready pictures** (no image API needed), or **generate new pictures inside DeepRole** (your own provider connection and possible charges).

For ready avatars, use your own art or download portraits from a web image tool such as [Adobe Firefly](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/generate-images-from-text-descriptions.html). Keep a base portrait and use it as a reference when making emotion variants. Then open **Character → Images → Image library**, upload your PNG/JPG/WebP files, assign emotions and **Save character**. This organizes existing pictures; it does not train a model or regenerate them. Set upload quality in **Settings → Appearance**, and enlarge the library’s **Preview size** to inspect faces.

### Venice: a straightforward native connection

Get your own key in the [API dashboard](https://venice.ai/settings/api); check available credit and current fees there. DeepRole does not sell keys or include free generation. [Official account/key instructions](https://venice.ai/blog/how-to-use-venice-api).

In **Settings → Images → Add connection**, fill these fields:

| Field | What to enter |
| --- | --- |
| Connection name | A label you recognize, e.g. “My image service”. |
| API format | **Venice native API**. |
| API address | `https://api.venice.ai/api/v1` — no `/models` or `/image/generate` suffix. |
| API key | Your private key; use **Save key**. |
| API access | Click **Allow API access** for that address. |
| Models | Click **Load models**; choose a generation model and an edit/reference model for uploaded faces. |
| Reference count | Use the model’s reported/documented limit, not another model’s advertising. |
| Extra parameters · JSON | Start with `{}`. Add only parameters documented for that exact model/endpoint. |

Enable and **Save connection**, assign it to the selected image preset, enable image generation and save the image settings. The live catalog, not this guide, supplies model IDs and known metadata. [Official catalog endpoint](https://docs.venice.ai/api-reference/endpoint/models/list), [reference editing documentation](https://docs.venice.ai/api-reference/endpoint/image/edit).

For consistent characters, pin a **Permanent reference** in each character’s **Images** tab, describe their appearance and choose a reference-capable model. Without a pinned image, the system uses textual appearance; it cannot guarantee the same face. Group scenes need a sufficient reference limit. Saved avatar quality and output resolution are different: provider-specific output parameters belong in the connection’s JSON, not the upload-quality setting.

### Other image APIs and common setup mistakes

For [OpenAI Images API](https://developers.openai.com/api/docs/guides/image-generation), use **OpenAI Images API** format and base address `https://api.openai.com/v1`, your own API key and an image-capable model available to your account. The adapter also supports compatible image services, but chat compatibility alone is insufficient. Do not paste a website login or your chat subscription password into the API-key field.

If nothing happens, check that both the connection and generation are enabled, the preset points to the saved connection, the key is saved, API access is granted and the selected model supports the requested operation. A model for text-to-image may not accept reference pictures. Open **Error details** under the red message: it shows the stage, DeepRole code and HTTP status when available, without exposing keys or repeating a paid request. Price, model availability and provider content rules can change; consult the linked official documentation rather than copying old model names.

## Connect an API

**Create illustration** appears only after DeepSeek finishes its entire reply, including hidden technical blocks. The button, frame preparation and finished image sit below the narrative, before the action options. Pinning the options does not move the illustration into the floating card; it stays with its own scene.

All illustration cards — finished images, loading and errors — share the action options' width and horizontal edges, including pictures in earlier replies. Resizing the window or composer and switching pinning automatically updates the layout. Without options, the visible floating composer's width is used; without either, cards keep their story reply's width. This changes only the on-screen card, never the saved image resolution.

Open **Settings → Images**. Enter a name, your API address and its format. DeepRole has no built-in provider, model inventory, prices or tariffs. Save your key separately, grant access to that address, enable the connection and load models. Select a model, save the connection and assign it to a settings preset.

The **Generation model** is used without references. The **Reference model** edits using an uploaded picture; a generation model does not necessarily support that. After loading Venice's catalog, these selectors are separated using actual API capabilities. A previously saved incompatible choice is preserved with a warning, not silently replaced. Missing capabilities are not guessed.

Presets only select the connection and labels. They do not trigger text analysis or secretly change request parameters. One entry in `IMAGE_CONTENT_LEVELS` defines a new preset's type, validation and both translations. The Explicit scenes · 18+ preset is stored only together with the age confirmation in the same section; without it the preset is not saved and no request is sent for it.

How adult content is handled is decided by your provider and your local law, not by DeepRole. Many APIs blur adult results through a service parameter that is on by default, and a host's filters can refuse even an uncensored model. The extension reports such a refusal in plain words and does not try to bypass it. Characters must be fictional; real people are not allowed.

Additional parameters are a JSON object, up to 32 fields and 32,000 characters. Unknown fields are preserved and transmitted unchanged, without a parameter allowlist. Transport-owned `model`, `modelId`, `prompt`, `image`, `images`, authorization and headers cannot be overridden: the entire configuration is rejected, not silently repaired. Documented parameters of a particular model, including its own service flags, are supplied by the extension owner, this field included. A JSON seed is passed literally; if a fixed character seed is also set, the request is rejected before sending rather than overwriting either value. No new dependencies are required.

The key is in a separate `storage.local` record, **not encrypted by the vault**. Our background code uses it; our DeepSeek page code does not read it. Only the last four characters are shown. Keys and current connection settings are excluded from backups and world packages: configure the connection again on another computer. An image's saved retry snapshot includes its original non-secret API address, model and parameters; importing it does not enable a connection or start a request. HTTPS is required except for localhost HTTP.

## Create an illustration

Hidden service messages leave no empty bubbles: DeepRole collapses their outer shells, spacing and DeepSeek controls. Useful cards, images and narrative remain visible. This is presentation only: original text stays in the chat history and remains readable by the extension. Clearance above the composer for pinned options is preserved.

Click **Create illustration** below the completed reply. The loading card appears immediately; DeepSeek privately prepares a JSON frame and all participants actually present, describing each person's appearance, action, position and focus. It receives the requested reply, textual profiles, reference hints and reference budget, never image pixels or API keys. It does not continue the roleplay or modify lore. A draft, another service request or an unfinished answer blocks preparation. A malformed plan stops before any paid image request.

In a group frame, every participant receives their assigned image within the connection's **Reference count**: six people and a limit of six means six references; three people means three. The main interlocutor has priority. Supporting people may appear in soft background blur but remain part of the frame; shared interactions ask for recognizable participants. The same composition rules apply to ordinary and non-explicit romantic/suggestive frames, with no separate sexual-scene mechanics. Each reference number is explicitly tied to its owner: identities and bodies must not be blended or swapped. Outfits, actions and poses follow the story, not the original portrait pose.

If a reference is missing or the budget is smaller than the cast, that character remains in the text description. **Description and characters** shows which participants have an image reference and which use text only. Model names and model-specific limits are not built in; known limits come from the API, and missing limits need checking against your connection's documentation. Local payload safeguards allow up to 40 participants and bound the total text size; this does not promise model capabilities. Anatomy, appearance consistency and action fidelity still depend on the generator: instructions and references help, but cannot guarantee the result.

Set optional **Image style** in **Settings → Images**. In **Character → Images**, pin **Neutral** and **Suggestive** references, each with an optional “when to use this look” hint. Ordinary scenes default to neutral. A missing alternate falls back to neutral; a missing neutral falls back to textual appearance. Multiple references are sent in character importance order within the selected model's configured capacity; every selected person's appearance remains in the description. Use the connection's reference model for Qwen Image Edit. Only the finished description, selected reference pixels and parameters go to the image provider.

Illustrations request **16:9** and generated selfies **9:16** by default. Explicit `size`, `width`, `height`, `aspect_ratio` and `resolution` extra parameters are passed unchanged. The provider result is saved without downscaling or cropping: the small image in chat is only a preview. Actual pixel dimensions appear below it; clicking opens the full viewer with 100% zoom. Previously saved 768×432 / 432×768 images cannot be restored automatically. Upload references still use the existing 1.5-million-pixel and under-10-MB budget; this does not restrict the finished result.

Each saved result allows up to 10 million locally encoded characters (roughly 7.5 MB of file bytes). A fitting PNG/JPEG/WebP is preserved byte-for-byte. Larger results may be recompressed as high-quality JPEG without changing pixel dimensions; if they still do not fit, an explicit error replaces silent downscaling. Before a new paid request, the world budget must have room for 10 million characters plus references. Budgets are not raised and existing data is not deleted. According to [Venice edit documentation](https://docs.venice.ai/api-reference/endpoint/image/edit), `resolution` and supported 1K/2K/4K tiers depend on the model; DeepRole never automatically raises the resolution or service charges.

**Try again** reuses the first attempt's saved description, model, seed and other parameters, and normalized reference pixels. It does not ask DeepSeek again or use new style/reference settings. An illustration retry shows loading and the new result **in the same card**. Back/forward buttons browse saved results for that particular story reply without API calls or charges; keyboard arrows work when the history controls are focused. Previous pictures remain accessible during loading and after a failure. A finished new result opens automatically; reload shows the latest result or latest failure. Deletion removes only the selected picture. A selfie retry still replaces that selfie. Older images without a saved request explain why this action is unavailable. Failures remain inline; refreshing never silently makes another paid request. Each manual retry may incur a charge. A timed-out request may already have been processed: check charges before retrying. If the original API address or protocol changes, the exact replay is blocked. API keys are never part of a snapshot.

Illustrations are separate from portraits, bound to a particular reply, and included in full backups and world exports. World packages preserve original chat associations as an archive; images are not rebound to a similarly named turn in a new chat. A world can hold up to 60 illustrations; its combined image budget, including portraits and selfies, is 50 MB in local encoded storage. Overflow never deletes existing data. Deleting an illustration does not edit lore or the sent reply. The vault protects illustration records alongside the library.

If the result links to a different host, a finished-image download button opens a separate extension tab to grant that host access. This downloads an existing file; it **does not regenerate it**. The temporary association lasts up to 15 minutes in session storage and is encrypted when the vault is enabled.

## Verified API formats

Contracts checked October 8, 2026, against the live model catalogue; the multi-edit limit was rechecked October 9 against Venice's documentation. These names describe adapter protocols, not built-in provider connections.

- OpenAI Images: [generation](https://developers.openai.com/api/reference/resources/images/methods/generate) and [JSON editing](https://developers.openai.com/api/reference/resources/images/methods/edit). References use data URLs in `images[].image_url`; responses contain JSON base64 or a URL. The [model list](https://developers.openai.com/api/reference/resources/models/methods/list) does not provide image prices or capabilities. TODO: a documented metadata extension; unknown values are not invented.
- Venice native: [generation](https://docs.venice.ai/api-reference/endpoint/image/generate) returns JSON `images[]` or its documented binary mode; [single edit](https://docs.venice.ai/api-reference/endpoint/image/edit) and [multi-edit](https://docs.venice.ai/api-reference/endpoint/image/multi-edit) return raw image bytes. Multi-edit sends JSON data URLs. **Single edit uses documented raw base64 in JSON**; data-URL support for that separate route is unconfirmed, with a TODO pending clarification.
- The [Venice model list](https://docs.venice.ai/api-reference/endpoint/models/list) is read from the API, including price, privacy, prompt limit and the uncensored flag. Venice does not keep its price in one field: generation and editing nest it per mode (`pricing.inpaint.usd`, `pricing.resolutions.1K.usd`), so DeepRole takes the lowest documented amount for a model and invents nothing when the API reports none. Current [multi-edit documentation](https://docs.venice.ai/api-reference/endpoint/image/multi-edit) defines a per-model image limit through `capabilities.maxInputImages`. The boolean `constraints.combineImages` cannot establish a number: an unknown limit no longer becomes the old guessed ceiling of three. After loading models, choosing the reference model applies a known API limit; an older saved value can be edited manually and the connection saved. Edit models come from the `type=inpaint` request, ordinary generation from `type=image`.

Compatible APIs must support the chosen protocol. An API requiring multipart instead of JSON or another endpoint is not guessed. Models may ignore seed or vary a character's appearance; references help but cannot guarantee identity.

## Errors and server information

400: request parameters; 401: key; 402: balance; 403: access forbidden; 404: model or endpoint not found; 413: oversized request; 415: format; 429: wait; 500: provider failure; 503: busy model. Errors never regenerate automatically. HTTP 403 alone does not establish a content-policy refusal; key permissions may be responsible. The three Venice response headers are preserved and displayed. Missing prices, edit capabilities or limits are not invented; the initial reference-count fallback is 1.

Hover over the red message for a short code or open **Error details**, also accessible by keyboard. Details show the failure stage, HTTP status, submitted model, endpoint, provider message/code if supplied, and names of invalid fields. A missing DeepSeek frame plan is distinguished from an image API failure. Viewing details makes no model request and costs nothing. Illustration diagnostics survive refresh; an old response discarded by earlier versions cannot be recovered.

Only documented JSON error fields are extracted, never a full request body or HTML. Keys, submitted images and source text are redacted. Large, malformed and unknown responses retain the known HTTP status without exposing raw bodies. After fixing a connection, use **Create illustration**: **Try again** deliberately sends the original model and parameters. Check provider charges before retrying a timeout.

TODO: an `INSUFFICIENT_BALANCE` code outside HTTP 402 and a payment link in an error body require a confirmed response schema. Currently HTTP 402 produces the balance message; payment URLs are not invented and raw error bodies are not exposed.

A rebuild does not reload an installed extension. Save open edits, replace the installed copy's files, reload DeepRole on the extensions page, and refresh DeepSeek.

## Verification

Stage one: skeleton, separate storage, interface, strict validation, quotas and export. Stage two: network adapters, live API models and JSON/binary results. Each stage separately runs TypeScript and the full unit/integration suite. Automated tests mock external requests. Paid generation is not claimed verified without a key and an agreed budget.
