// Requires Playwright; use PLAYWRIGHT_PATH to reuse an existing installation.
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const extensions = {word: 'docx', cell: 'xlsx', slide: 'pptx', pdf: 'pdf'};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function open(browser, product, variant, fixture, record = false) {
    const context = await browser.newContext({viewport: {width: 1440, height: 960},
        acceptDownloads: true, ...(record ? {recordVideo: {dir: path.join(root, 'runtime/videos'), size: {width: 1440, height: 960}}} : {})});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:8782/demo?product=${product}&build=${variant}&fixture=${fixture}`);
    await page.waitForFunction(() => window.demoReady, null, {timeout: 120000});
    const frame = page.frames().find(frame => /editor\/main\//.test(frame.url()));
    if (!frame) throw new Error('Editor iframe missing');
    const app = {word: 'documenteditor', cell: 'spreadsheeteditor', slide: 'presentationeditor', pdf: 'pdfeditor'}[product];
    if (!frame.url().includes(app + '/main/')) throw new Error('Wrong editor application: ' + frame.url());
    await frame.waitForFunction(() => window.Asc && Asc.editor, null, {timeout: 30000});
    await pause(1000);
    const tip = frame.getByText('Got it', {exact: true}).first();
    if (await tip.isVisible()) await tip.click();
    if (product === 'pdf' && !await frame.evaluate(() => Asc.editor.canEdit())) {
        await frame.getByRole('button', {name: 'Edit PDF', exact: true}).click();
    }
    await frame.waitForFunction(() => Asc.editor.canEdit(), null, {timeout: 30000});
    return {context, page, frame, errors};
}

async function insert(frame) {
    await frame.evaluate(() => Asc.editor.asc_createSmartArt(Asc.c_oAscSmartArtTypes.BasicProcess));
    await frame.waitForFunction(() => {
        const controller = Asc.editor.getGraphicController();
        return controller && controller.selectedObjects.some(object => object instanceof AscFormat.SmartArt);
    }, null, {timeout: 30000});
}

async function select(frame, product) {
    const result = await frame.evaluate(product => {
        const api = Asc.editor;
        const controller = api.getGraphicController();
        const document = api.getLogicDocument();
        let objects;
        if (product === 'word') objects = controller.getDrawingArray();
        else if (product === 'cell') objects = controller.drawingObjects.getDrawingObjects().map(item => item.graphicObject);
        else if (product === 'slide') objects = document.Slides[0].cSld.spTree;
        else objects = controller.selectedObjects;
        const diagram = objects.find(object => object instanceof AscFormat.SmartArt);
        if (!diagram) throw new Error('SmartArt diagram missing from document');
        controller.resetSelection();
        controller.selectObject(diagram, 0);
        controller.updateSelectionState();
        if (document && document.Document_UpdateInterfaceState) document.Document_UpdateInterfaceState();
        if (document && document.UpdateInterfaceState) document.UpdateInterfaceState();
        if (product === 'pdf') document.UpdateInterface();
        if (controller.drawingObjects && controller.drawingObjects.sendGraphicObjectProps) controller.drawingObjects.sendGraphicObjectProps();
        window.demoDiagram = diagram;
        const cursor = product === 'word' ? api.getDrawingDocument().ConvertCoordsToCursorWR(
            diagram.x + diagram.extX / 2, diagram.y + diagram.extY / 2, diagram.selectStartPage || 0) : null;
        return {shapes: diagram.drawing.spTree.length, structuralApi: typeof api.asc_getSmartArtOutline === 'function', cursor};
    }, product);
    if (result.cursor) {
        const box = await frame.locator('#editor_sdk').boundingBox();
        await frame.page().mouse.click(box.x + result.cursor.X, box.y + result.cursor.Y);
    }
    const sidebar = frame.locator('#id-right-menu-shape');
    if (await sidebar.isVisible() && await sidebar.isEnabled()) await sidebar.click();
    await pause(500);
    return result;
}

async function download(page, frame, product, file) {
    const download = page.waitForEvent('download', {timeout: 120000});
    await frame.evaluate(product => {
        const formats = {word: 'DOCX', cell: 'XLSX', slide: 'PPTX', pdf: 'PDF'};
        Asc.editor.asc_DownloadAs(new Asc.asc_CDownloadOptions(Asc.c_oAscFileType[formats[product]]));
    }, product);
    await (await download).saveAs(file);
}

async function seed(browser, product) {
    const {context, page, frame} = await open(browser, product, 'after', 'blank');
    try {
        await insert(frame);
        const changed = await frame.evaluate(async () => {
            const api = Asc.editor;
            const outline = api.asc_getSmartArtOutline();
            const labels = ['Plan', 'Build', 'Review'];
            return api.asc_setSmartArtOutline(outline.id, outline.nodes.map((node, i) => ({...node, text: labels[i] || node.text})));
        });
        if (!changed) throw new Error('Seed diagram edit rejected');
        await pause(1000);
        await download(page, frame, product, path.join(root, `runtime/files/seed.${extensions[product]}`));
        console.log(product + ': real seeded file downloaded');
    } finally {await context.close();}
}

async function reopen(browser, product) {
    const {context, page, frame} = await open(browser, product, 'after', 'result');
    try {
        await select(frame, product);
        const state = await frame.evaluate(() => ({
            nodes: Asc.editor.asc_getSmartArtOutline().nodes,
            renderedText: window.demoDiagram.drawing.spTree.map(shape => {
                const body = shape.getDocContent && shape.getDocContent();
                return body ? body.GetText({}) : '';
            })
        }));
        for (const label of ['Plan', 'Build', 'Review', 'Release']) {
            if (!state.nodes.some(node => node.text === label) || !state.renderedText.some(text => text.includes(label))) {
                throw new Error(product + ': reopened file lost ' + label);
            }
        }
        if (state.nodes.length !== 4) throw new Error(product + ': reopened file lost structure');
        await page.screenshot({path: path.join(root, `media/${product}-reopened.png`)});
        await fs.writeFile(path.join(root, `runtime/${product}-reopened.json`), JSON.stringify(state, null, 2));
        console.log(product + ': saved Office file reopened with four visible labeled nodes');
    } finally {await context.close();}
}

async function capture(browser, product, variant) {
    const isPdf = product === 'pdf';
    const {context, page, frame, errors} = await open(browser, product, variant, isPdf ? 'blank' : 'seed', true);
    const video = page.video();
    try {
        if (isPdf) await insert(frame);
        const selected = await select(frame, product);
        if (selected.structuralApi !== (variant === 'after')) throw new Error('Wrong SDK build loaded');
        await pause(1000);
        await page.screenshot({path: path.join(root, `media/${product}-${variant}.png`)});
        await pause(1500);
        if (variant === 'after') {
            const button = frame.locator('.smartart-edit button');
            await button.waitFor({state: 'visible', timeout: 10000});
            await button.click();
            const dialog = frame.locator('dialog');
            await dialog.waitFor({state: 'visible'});
            await pause(1500);
            await dialog.locator('textarea').last().focus();
            await dialog.getByRole('button', {name: 'Add node', exact: true}).click();
            await dialog.locator('textarea').last().fill('Release');
            await pause(1500);
            await page.screenshot({path: path.join(root, `media/${product}-editing.png`)});
            await dialog.getByRole('button', {name: 'Apply', exact: true}).click();
            await dialog.waitFor({state: 'detached'});
            await pause(1500);
            const outline = await frame.evaluate(() => Asc.editor.asc_getSmartArtOutline());
            if (!outline || outline.nodes.length !== 4 || !outline.nodes.some(node => node.text === 'Release')) throw new Error('Apply did not add Release node');
            await page.screenshot({path: path.join(root, `media/${product}-result.png`)});
            await pause(2000);
            if (!isPdf) {
                await download(page, frame, product, path.join(root, `runtime/files/result.${extensions[product]}`));
            }
            selected.outline = outline.nodes;
        }
        if (errors.length) throw new Error(errors.join('\n'));
        await fs.writeFile(path.join(root, `runtime/${product}-${variant}.json`), JSON.stringify(selected, null, 2));
        console.log(product + '/' + variant + ': capture passed');
    } catch (error) {
        await page.screenshot({path: path.join(root, `runtime/${product}-${variant}-failure.png`)});
        await fs.writeFile(path.join(root, `runtime/${product}-${variant}-failure.html`), await frame.content());
        throw error;
    } finally {
        await context.close();
        await video.saveAs(path.join(root, `media/${product}-${variant}.webm`));
    }
}

(async () => {
    await fs.mkdir(path.join(root, 'media'), {recursive: true});
    await fs.mkdir(path.join(root, 'runtime/videos'), {recursive: true});
    const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        headless: true, args: ['--disable-dev-shm-usage']});
    try {
        const mode = process.argv[2] || 'record';
        const products = process.argv.slice(3);
        for (const product of products.length ? products : ['word', 'cell', 'slide', 'pdf']) {
            if (!extensions[product]) throw new Error('Unknown product: ' + product);
            if (mode === 'seed') await seed(browser, product);
            else if (mode === 'reopen') await reopen(browser, product);
            else {await capture(browser, product, 'before'); await capture(browser, product, 'after');}
        }
    } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
