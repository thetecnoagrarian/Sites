(() => {
    const panel = document.getElementById('gallery-editor');
    if (!panel) return;
    const form = panel.closest('form');
    const { form: saved, items } = JSON.parse(panel.dataset.editor);
    const status = panel.querySelector('[data-gallery-status]');
    const selection = panel.querySelector('[data-gallery-selection]');
    const list = panel.querySelector('[data-gallery-items]');
    const files = panel.querySelector('[data-gallery-files]');
    const body = form.elements.body;
    const publish = form.querySelector('button[type="submit"]');
    const save = panel.querySelector('[data-save-draft]');
    const preview = panel.querySelector('[data-preview-draft]');
    const placement = panel.querySelector('[data-gallery-placement]');
    const csrf = form.elements._csrf.value;
    const revision = form.elements.galleryDraftRevision;
    const knownPhotos = new Set(items.filter(item => item.staged).map(item => item.id));
    const receivedRevisions = new Set();
    const currentDraft = panel.querySelector('[data-current-draft]');
    const publicationPending = panel.disabled;
    const base = `/admin/gallery-drafts/${panel.dataset.draft}`;
    let busy = false;
    let caret = [body.selectionStart, body.selectionEnd];

    for (const [name, values] of Object.entries(saved)) {
        if (name === 'bodyGalleryItems') continue;
        const inputs = [...form.elements].filter(input => input.name === name || input.name === `${name}[]`);
        const valuesList = Array.isArray(values) ? values : [values];
        inputs.forEach((input, index) => {
            if (input.type === 'checkbox') input.checked = valuesList.includes(input.value);
            else input.value = valuesList[index] ?? '';
        });
    }
    body.addEventListener('blur', () => { caret = [body.selectionStart, body.selectionEnd]; });

    function lock(value) {
        busy = value;
        for (const control of [files, save, preview, publish, placement]) {
            if (control) control.disabled = value || publicationPending;
        }
    }
    function rememberDraft() {
        const url = new URL(window.location.href);
        if (url.searchParams.get('draft') !== panel.dataset.draft) {
            url.searchParams.set('draft', panel.dataset.draft);
            window.history.replaceState(null, '', url);
        }
    }
    function synchronize() {
        form.elements.galleryKnownPhotos.value = JSON.stringify([...knownPhotos].sort());
        if (!list) return;
        const rows = [...list.children];
        selection.value = JSON.stringify(rows.map((row, index) => {
            row.querySelector('[data-move="-1"]').disabled = index === 0;
            row.querySelector('[data-move="1"]').disabled = index === rows.length - 1;
            const label = `Photo ${index + 1}`;
            const position = row.querySelector('[data-gallery-position]');
            position.value = index + 1;
            position.max = rows.length;
            position.setAttribute('aria-label', `${label} position`);
            row.querySelector('[data-gallery-alt]').setAttribute('aria-label', `${label} description`);
            row.querySelector('[data-gallery-caption]').setAttribute('aria-label', `${label} caption`);
            for (const button of row.querySelectorAll('button')) {
                button.setAttribute('aria-label', `${button.textContent.trim()} (${label.toLowerCase()})`);
            }
            return {
                id: row.dataset.id, alt: row.querySelector('[data-gallery-alt]').value,
                caption: row.querySelector('[data-gallery-caption]').value
            };
        }));
    }
    function showPhoto(item) {
        if ([...list.children].some(row => row.dataset.id === item.id)) return;
        const row = panel.querySelector('[data-gallery-item]').content.firstElementChild.cloneNode(true);
        row.dataset.id = item.id;
        if (item.src) row.querySelector('img').src = item.src;
        row.querySelector('[data-gallery-alt]').value = item.alt ?? '';
        row.querySelector('[data-gallery-caption]').value = item.caption ?? '';
        list.append(row);
        synchronize();
    }
    list?.addEventListener('input', event => {
        if (!event.target.hasAttribute('data-gallery-position')) synchronize();
    });
    list?.addEventListener('change', event => {
        if (busy || !event.target.hasAttribute('data-gallery-position')) return;
        const row = event.target.closest('li');
        const index = event.target.valueAsNumber - 1;
        const others = [...list.children].filter(item => item !== row);
        if (Number.isInteger(index) && index >= 0 && index <= others.length) {
            list.insertBefore(row, others[index] ?? null);
            status.textContent = `Moved to photo ${index + 1}.`;
        }
        synchronize();
        event.target.focus();
    });
    list?.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || busy) return;
        const row = button.closest('li');
        if (button.hasAttribute('data-remove')) {
            const next = row.nextElementSibling ?? row.previousElementSibling;
            row.remove();
            (next?.querySelector('[data-remove]') ?? files).focus();
            status.textContent = list.children.length
                ? 'Photo removed from the gallery. Save the draft to keep this change.'
                : 'Gallery is empty. Remove the gallery marker from the article before publishing.';
        } else {
            const up = button.dataset.move === '-1';
            const sibling = up ? row.previousElementSibling : row.nextElementSibling;
            if (!sibling) return;
            if (up) list.insertBefore(row, sibling);
            else list.insertBefore(sibling, row);
            status.textContent = `Moved to photo ${[...list.children].indexOf(row) + 1}.`;
        }
        synchronize();
        if (row.isConnected) (button.disabled ? row.querySelector('[data-gallery-alt]') : button).focus();
    });
    placement?.addEventListener('click', () => {
        const marker = '<div data-body-gallery></div>';
        if (body.value.includes(marker)) {
            status.textContent = 'A gallery marker is already in the article. Move that line to change placement.';
            return;
        }
        const start = body.value.lastIndexOf('\n', Math.max(caret[0] - 1, 0)) + 1;
        body.setRangeText(`${marker}\n`, start, start, 'end');
        body.focus();
        status.textContent = 'Gallery marker inserted. Keep it on its own line outside other HTML elements.';
    });
    async function request(url, data) {
        const response = await fetch(url, { method: 'POST', body: data,
            headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' } });
        if (response.redirected) return { redirect: response.url };
        let result;
        try { result = await response.json(); }
        catch { throw new Error('The request could not be confirmed. Check your login or retry.'); }
        if (!response.ok) throw Object.assign(new Error(result.error ?? 'The request failed.'), {
            editUrl: result.conflict ? result.editUrl : null
        });
        return result;
    }
    function showError(error) {
        status.textContent = error.message;
        if (error.editUrl) {
            currentDraft.href = error.editUrl;
            currentDraft.hidden = false;
        }
    }
    async function upload(job) {
        job.note.textContent = `${job.file.name} — uploading and preparing`;
        job.retry.hidden = true;
        const data = new FormData();
        data.append('_csrf', csrf);
        data.append('uploadId', job.id);
        data.append('photo', job.file);
        try {
            const result = await request(`${base}/images`, data);
            if (!result.id) throw new Error('The upload could not be confirmed. Check your login or retry.');
            knownPhotos.add(result.id);
            if (result.revision > Number(revision.value)) receivedRevisions.add(result.revision);
            // Do not skip a revision saved or uploaded by another tab.
            while (receivedRevisions.delete(Number(revision.value) + 1)) revision.value = Number(revision.value) + 1;
            showPhoto(result);
            job.note.textContent = `${job.file.name} — ready`;
            rememberDraft();
        } catch (error) {
            job.note.textContent = `${job.file.name} — ${error.message}`;
            job.retry.hidden = false;
        }
    }
    files?.addEventListener('change', async () => {
        if (busy || publicationPending) return;
        const batch = [...files.files];
        files.value = '';
        if (!batch.length) return;
        if (list.children.length + batch.length > 100) {
            status.textContent = 'Choose fewer photos. A gallery can contain at most 100.';
            return;
        }
        lock(true);
        const jobList = panel.querySelector('[data-gallery-uploads]');
        const jobs = batch.map(file => {
            const row = document.createElement('li');
            const note = document.createElement('span');
            const retry = document.createElement('button');
            const job = { id: crypto.randomUUID(), file, note, retry };
            note.textContent = `${file.name} — queued`;
            retry.type = 'button';
            retry.textContent = 'Retry photo';
            retry.setAttribute('aria-label', `Retry ${file.name}`);
            retry.hidden = true;
            retry.addEventListener('click', async () => {
                if (busy || list.children.length >= 100) return;
                lock(true);
                try { await upload(job); } finally { lock(false); }
            });
            row.append(note, ' ', retry);
            jobList.append(row);
            return job;
        });
        try {
            for (const [index, job] of jobs.entries()) {
                status.textContent = `Processing photograph ${index + 1} of ${jobs.length}.`;
                await upload(job);
            }
            status.textContent = `${list.children.length} photos in the gallery. Check the upload list for any failures.`;
        } finally { lock(false); }
    });
    async function saveDraft(openPreview) {
        if (busy || publicationPending) return;
        if (form.querySelector('#image-input')?.files.length) {
            status.textContent = 'New highlights are added when publishing. Clear that file selection to save or preview this draft.';
            return;
        }
        synchronize();
        const data = new FormData(form);
        data.delete('image');
        data.set('submitIntent', 'draft');
        lock(true);
        status.textContent = 'Saving private draft…';
        try {
            const result = await request(form.action, data);
            if (!result.revision) throw new Error('The draft save could not be confirmed. Check your login or retry.');
            revision.value = result.revision;
            window.history.replaceState(null, '', result.editUrl);
            status.textContent = 'Private draft saved.';
            currentDraft.hidden = true;
            if (openPreview) window.location.assign(result.previewUrl);
        } catch (error) {
            showError(error);
        } finally { lock(false); }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || publicationPending) return;
        synchronize();
        if ([...(list?.querySelectorAll('[data-gallery-alt]') ?? [])].some(input => !input.value.trim())) {
            status.textContent = 'Add a photo description to every gallery image before publishing.';
            [...list.querySelectorAll('[data-gallery-alt]')].find(input => !input.value.trim()).focus();
            return;
        }
        const data = new FormData(form);
        lock(true);
        status.textContent = 'Publishing article…';
        try {
            const result = await request(form.action, data);
            if (!result.redirect) throw new Error('Publication could not be confirmed. Retry the same submission to check.');
            window.location.assign(result.redirect);
        } catch (error) {
            showError(error);
        } finally {
            lock(false);
        }
    });
    if (selection) {
        selection.disabled = false;
        items.forEach(showPhoto);
        synchronize();
    }
    save.addEventListener('click', () => saveDraft(false));
    preview.addEventListener('click', () => saveDraft(true));
    lock(false);
})();
