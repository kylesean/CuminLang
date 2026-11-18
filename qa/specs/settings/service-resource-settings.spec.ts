import { expect, type Locator, type Page } from '@playwright/test';
import { isSecretPersisted, readConfigValue, test } from '../../support/fixtures';
import { openSettingsSection, reloadSettingsPage, switchSettingsSection, chooseInRow, selectInRow } from '../../support/settings-page';
import {
    SETTING_ITEM_TESTIDS,
    modelRowTestId,
    providerPresetCardTestId,
} from '../../../src/common/constants/qa-testids';

/** 进入服务与资源设置页。 */
async function openResourcesSetting(page: Page): Promise<void> {
    await openSettingsSection(page, 'resources', page.getByRole('heading', { name: '服务与资源' }));
}

/** 切到服务与资源页的页内分区。 */
async function openResourcesTab(page: Page, tab: '本地资源' | '云端服务'): Promise<void> {
    await page.getByRole('tab', { name: tab, exact: true }).click();
}

function apiKeyInput(page: Page): Locator {
    return page.getByLabel('API Key');
}

function apiUrlInput(page: Page): Locator {
    return page.getByRole('textbox', { name: 'API URL' });
}

function addModelInput(page: Page): Locator {
    return page.getByRole('textbox', { name: '输入模型标识，如 deepseek-flash' });
}

/** 「API 类型」下拉的显示文案到存储枚举值的对应表。 */
const API_FORMAT_BY_LABEL: Record<string, string> = {
    'OpenAI Chat Completions': 'openai',
    'OpenAI Responses': 'openai-responses',
    'Anthropic': 'anthropic',
    'Gemini': 'gemini',
};

/** 云端服务里填写的 API Key，仅用于验证落盘，不是真实密钥。 */
const API_KEY = 'sk-e2e-not-a-real-key';
/** 云端服务里填写的接口地址。 */
const ENDPOINT = 'https://api.e2e.test/v1';
/** 新增的模型标识。 */
const NEW_MODEL = 'e2e-model-alpha';
/**
 * 已保存密钥后 API Key 输入框的占位提示。
 *
 * 详情接口不下发明文，只给「•••• + 末四位」的脱敏提示；输入框留空表示沿用已保存的值。
 * 按末四位拼出完整文案，既能抓住「明文回显」回归，也能抓住「脱敏格式退化」。
 */
const SAVED_KEY_PLACEHOLDER = `已保存密钥（••••${API_KEY.slice(-4)}），输入新密钥后点保存替换`;

/**
 * 删除模型行：先点行内删除，再在统一确认弹窗里确认。
 *
 * 删除模型不可撤销，产品是两步交互——只点行内按钮不会落盘，也不会让表格行消失。
 *
 * @param page 应用主窗口页面。
 * @param row 目标模型所在的表格行。
 */
async function deleteModelRow(page: Page, row: Locator): Promise<void> {
    await row.getByRole('button', { name: '删除' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '删除' }).click();
    await expect(dialog).toBeHidden();
}

test.describe('服务与资源设置', () => {
    test('[SET-SVC-01] 云端服务填写的密钥、接口地址与模型清单会落盘，重进页面仍回显 @smoke', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await apiKeyInput(page).fill(API_KEY);
        await page.getByRole('button', { name: '保存' }).click();
        await apiUrlInput(page).fill(ENDPOINT);

        // 模型标识靠「添加」进列表，不是直接编辑文本
        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toBeVisible();

        await expect.poll(() => isSecretPersisted(userDataDir, 'apiKeys.openAi.key', API_KEY)).toBe(true);
        await expect.poll(() => readConfigValue(userDataDir, 'apiKeys.openAi.endpoint')).toBe(ENDPOINT);
        // 模型清单以换行文本落盘；断言包含而不是全等，避免绑死内置默认模型
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toContain(NEW_MODEL);

        // 重进页面：密钥不再明文下发，只展示脱敏提示；地址与模型清单仍来自后端回读
        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await openResourcesTab(page, '云端服务');
        const savedKeyInput = apiKeyInput(page);
        await expect(savedKeyInput).toHaveAttribute('placeholder', SAVED_KEY_PLACEHOLDER);
        await expect(savedKeyInput).toHaveValue('');
        await expect(savedKeyInput).not.toHaveAttribute('placeholder', new RegExp(API_KEY));
        await expect(apiUrlInput(page)).toHaveValue(ENDPOINT);
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toBeVisible();

        // 留空保存必须沿用旧 key：只改接口地址触发一次自动保存，密钥输入框保持为空
        const rotatedEndpoint = 'https://api.e2e.test/v2';
        await apiUrlInput(page).fill(rotatedEndpoint);
        await expect.poll(() => readConfigValue(userDataDir, 'apiKeys.openAi.endpoint')).toBe(rotatedEndpoint);
        await expect.poll(() => isSecretPersisted(userDataDir, 'apiKeys.openAi.key', API_KEY)).toBe(true);

        // 再重进一次：密钥仍是「已保存」的脱敏态，说明留空保存没有把旧 key 当成清空
        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await openResourcesTab(page, '云端服务');
        await expect(apiKeyInput(page)).toHaveAttribute('placeholder', SAVED_KEY_PLACEHOLDER);
        await expect(apiKeyInput(page)).toHaveValue('');
        await expect(apiUrlInput(page)).toHaveValue(rotatedEndpoint);
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toBeVisible();
    });

    test('[SET-SVC-02] 识别方式与词典补充方式改动会落盘，重进页面仍回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);

        await chooseInRow(page, 'transcription', '兼容模式');
        await expect.poll(() => readConfigValue(userDataDir, 'transcription.engine')).toBe('sherpa-onnx');

        // 先添加云端模型并切到该模型，再切回「不补充」，确认下拉改动真实写盘
        await openResourcesTab(page, '云端服务');
        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toContain(NEW_MODEL);

        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'dictionary', NEW_MODEL);
        await expect.poll(() => readConfigValue(userDataDir, 'providers.dictionary')).toBe('openai');
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.dictionary')).toBe(NEW_MODEL);

        await chooseInRow(page, 'dictionary', '仅用本地词典');
        await expect.poll(() => readConfigValue(userDataDir, 'providers.dictionary')).toBe('none');

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'transcription')).toHaveText('兼容模式');
        await expect(selectInRow(page, 'dictionary')).toHaveText('仅用本地词典');
    });

    test('[SET-SVC-03] 识别方式在兼容模式与硬件加速之间往返切换都落盘，重进页面回显最后一次选择', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);

        // 默认是硬件加速，先切到兼容模式，确认同一个下拉换回来也能写回配置
        await expect(selectInRow(page, 'transcription')).toHaveText('硬件加速（推荐）');
        await chooseInRow(page, 'transcription', '兼容模式');
        await expect.poll(() => readConfigValue(userDataDir, 'transcription.engine')).toBe('sherpa-onnx');

        await chooseInRow(page, 'transcription', '硬件加速（推荐）');
        await expect.poll(() => readConfigValue(userDataDir, 'transcription.engine')).toBe('whisper-cpp');

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'transcription')).toHaveText('硬件加速（推荐）');
    });

    test('[SET-SVC-04] 使用厂商预设会回填接口地址与 API 类型并落盘，重进页面仍回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await page.getByRole('button', { name: '使用预设' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('选择厂商预设')).toBeVisible();

        // 预设的地址与类型从弹窗里现读，断言不写死具体厂商参数
        const presetCard = dialog.getByTestId(providerPresetCardTestId('anthropic'));
        const presetEndpoint = (await presetCard.getByTestId(SETTING_ITEM_TESTIDS.providerPresetEndpoint).innerText()).trim();
        const presetFormatLabel = (await presetCard.getByTestId(SETTING_ITEM_TESTIDS.providerPresetFormat).innerText()).trim();
        await presetCard.getByRole('button', { name: '使用', exact: true }).click();
        await expect(dialog).toBeHidden();

        const presetApiFormat = API_FORMAT_BY_LABEL[presetFormatLabel];
        expect(presetApiFormat, `未映射的 API 类型标签：${presetFormatLabel}`).toBeTruthy();
        await expect.poll(() => readConfigValue(userDataDir, 'apiKeys.openAi.endpoint')).toBe(presetEndpoint);
        await expect.poll(() => readConfigValue(userDataDir, 'apiKeys.openAi.apiFormat')).toBe(presetApiFormat);

        // 当前页面即时回显
        await expect(apiUrlInput(page)).toHaveValue(presetEndpoint);
        await expect(selectInRow(page, 'apiFormat')).toHaveText(presetFormatLabel);

        // 重进页面：地址与类型来自后端回读
        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(apiUrlInput(page)).toHaveValue(presetEndpoint);
        await expect(selectInRow(page, 'apiFormat')).toHaveText(presetFormatLabel);
    });

    test('[SET-SVC-05] 模型可自由启用/关闭与删除', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toContain(NEW_MODEL);

        const modelRow = page.getByTestId(modelRowTestId(NEW_MODEL));
        await expect(modelRow).toBeVisible();

        // 关闭模型启用开关：写入 models.openai.disabled 并在列表显示「已关闭」
        const enableSwitch = modelRow.getByRole('switch', { name: `启用模型 ${NEW_MODEL}` });
        await expect(enableSwitch).toBeChecked();
        await enableSwitch.click();
        await expect(enableSwitch).not.toBeChecked();
        await expect(modelRow.getByText('已关闭')).toBeVisible();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.disabled')).toContain(NEW_MODEL);

        // 重新启用并添加临时模型，验证删除同样持久化
        await enableSwitch.click();
        await expect(enableSwitch).toBeChecked();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.disabled')).toBe('');

        const temporaryModel = 'e2e-model-temp';
        await addModelInput(page).fill(temporaryModel);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toContain(temporaryModel);

        const temporaryRow = page.getByTestId(modelRowTestId(temporaryModel));
        await expect(temporaryRow.getByRole('button', { name: '删除' })).toBeEnabled();
        await deleteModelRow(page, temporaryRow);

        // 删除同样要写回配置，且重进页面后不会复现
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).not.toContain(temporaryModel);
        await expect(page.getByTestId(modelRowTestId(temporaryModel))).toHaveCount(0);
        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await openResourcesTab(page, '云端服务');
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toBeVisible();
        await expect(page.getByTestId(modelRowTestId(temporaryModel))).toHaveCount(0);
    });

    test('[SET-SVC-06] 把字幕翻译指到新增的云端模型后，模型槽位落盘并回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toContain(NEW_MODEL);

        // 功能下拉里的模型清单来自详情缓存，保存成功后缓存会立刻刷新，新模型无需重进页面即可选中
        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'subtitleTranslation', NEW_MODEL);

        await expect.poll(() => readConfigValue(userDataDir, 'providers.subtitleTranslation')).toBe('openai');
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.subtitleTranslation')).toBe(NEW_MODEL);

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'subtitleTranslation')).toHaveText(NEW_MODEL);
    });

    test('[SET-SVC-07] 字幕翻译下拉不再提供已下线的本地轻量引擎，切到关闭后引擎落盘并回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        // 先绑定到云端模型，让状态从默认 none 切实发生变化，避免「原本就是 none」导致无脏写
        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'subtitleTranslation', NEW_MODEL);
        await expect.poll(() => readConfigValue(userDataDir, 'providers.subtitleTranslation')).toBe('openai');

        // OPUS-MT 轻量管线已移除：下拉里不能再出现「本地基础资源包」，
        // 否则用户选了它，实际却走别的引擎，提示与真实能力不符。
        await selectInRow(page, 'subtitleTranslation').scrollIntoViewIfNeeded();
        await selectInRow(page, 'subtitleTranslation').click();
        await expect(page.getByRole('option', { name: '关闭' })).toBeVisible();
        await expect(page.getByRole('option', { name: '本地基础资源包' })).toHaveCount(0);
        await expect(page.getByText('轻量翻译只支持中文')).toHaveCount(0);
        await page.getByRole('option', { name: '关闭' }).click();

        await expect.poll(() => readConfigValue(userDataDir, 'providers.subtitleTranslation')).toBe('none');

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'subtitleTranslation')).toHaveText('关闭');
    });

    test('[SET-SVC-08] 词典查询切到云端模型后引擎与槽位落盘，本地资源区展示英英释义增强包入口', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();

        await openResourcesTab(page, '本地资源');
        await expect(page.getByText('英英释义增强包', { exact: true })).toBeVisible();
        await chooseInRow(page, 'dictionary', NEW_MODEL);

        await expect.poll(() => readConfigValue(userDataDir, 'providers.dictionary')).toBe('openai');
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.dictionary')).toBe(NEW_MODEL);

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'dictionary')).toHaveText(NEW_MODEL);
    });

    test('[SET-SVC-09] 整句讲解启用后切到禁用，开关落盘为关闭并重进回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);

        // 未配置模型时默认处于禁用态
        await expect(selectInRow(page, 'sentenceLearning')).toHaveText('禁用');

        // 添加云端模型并开启整句讲解，再切回禁用验证持久化
        await openResourcesTab(page, '云端服务');
        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();

        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'sentenceLearning', NEW_MODEL);
        await expect.poll(() => readConfigValue(userDataDir, 'features.openai.enableSentenceLearning')).toBe('true');

        await chooseInRow(page, 'sentenceLearning', '禁用');
        await expect.poll(() => readConfigValue(userDataDir, 'features.openai.enableSentenceLearning')).toBe('false');

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(selectInRow(page, 'sentenceLearning')).toHaveText('禁用');
    });

    test('[SET-SVC-10] 已绑定功能的云端模型也可直接删除，删除后列表与配置不再保留该模型', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        // 新增模型并绑定到字幕翻译；模型列表支持自由删除
        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'subtitleTranslation', NEW_MODEL);
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.subtitleTranslation')).toBe(NEW_MODEL);

        await openResourcesTab(page, '云端服务');
        const modelRow = page.getByTestId(modelRowTestId(NEW_MODEL));
        await expect(modelRow.getByRole('button', { name: '删除' })).toBeEnabled();

        await deleteModelRow(page, modelRow);
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).not.toContain(NEW_MODEL);
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toHaveCount(0);

        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await openResourcesTab(page, '云端服务');
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toHaveCount(0);
    });

    test('[SET-SVC-11] 关掉应用再打开，云端密钥仍原样回读', async ({ openSession, userDataDir }) => {
        const first = await openSession();
        await openResourcesSetting(first.page);
        await openResourcesTab(first.page, '云端服务');
        await apiKeyInput(first.page).fill(API_KEY);
        await first.page.getByRole('button', { name: '保存' }).click();
        await expect.poll(() => isSecretPersisted(userDataDir, 'apiKeys.openAi.key', API_KEY)).toBe(true);
        await first.close();

        // 重启后不做任何操作：密钥必须来自持久化配置，且只以脱敏提示呈现、不回传明文
        const restarted = await openSession();
        await openResourcesSetting(restarted.page);
        await openResourcesTab(restarted.page, '云端服务');
        const savedKeyInput = apiKeyInput(restarted.page);
        await expect(savedKeyInput).toHaveAttribute('placeholder', SAVED_KEY_PLACEHOLDER);
        await expect(savedKeyInput).toHaveValue('');
        await expect(savedKeyInput).not.toHaveAttribute('placeholder', new RegExp(API_KEY));
    });

    test('[SET-SVC-13] 把云端模型清单删空后清单保持为空，此时改动偏好仍会正常落盘', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await addModelInput(page).fill(NEW_MODEL);
        await page.getByRole('button', { name: '添加', exact: true }).click();
        const addedRow = page.getByTestId(modelRowTestId(NEW_MODEL));
        await expect(addedRow).toBeVisible();
        await deleteModelRow(page, addedRow);

        // 清空就是清空：清单在磁盘上留空，不会又被兜底模型塞回来
        await expect.poll(() => readConfigValue(userDataDir, 'models.openai.available')).toBe('');
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toHaveCount(0);
        await reloadSettingsPage(page, page.getByRole('heading', { name: '服务与资源' }));
        await expect(page.getByTestId(modelRowTestId(NEW_MODEL))).toHaveCount(0);

        // 清单为空只影响云端模型可选范围，不该连带把无关偏好一起拒绝保存
        await openResourcesTab(page, '本地资源');
        await chooseInRow(page, 'transcription', '兼容模式');
        await expect.poll(() => readConfigValue(userDataDir, 'transcription.engine')).toBe('sherpa-onnx');
        // 限定 main，排除 @astryxdesign/core 根节点的全局 live-region alert。
        await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    });

    test('[SET-SVC-17] 填完接口地址立刻切到别的设置栏目，改动仍会落盘并在重进后回显', async ({ session, userDataDir }) => {
        const page = session.page;
        await openResourcesSetting(page);
        await openResourcesTab(page, '云端服务');

        await apiUrlInput(page).fill(ENDPOINT);

        // 关键：填完立刻离开，不给 600ms 防抖留时间，验证离开栏目时自动保存冲刷不丢配置
        await switchSettingsSection(page, 'appearance', page.getByRole('radio', { name: '深色' }));

        await expect.poll(() => readConfigValue(userDataDir, 'apiKeys.openAi.endpoint')).toBe(ENDPOINT);

        // 回到该页：接口地址来自后端回读
        await switchSettingsSection(page, 'resources', page.getByRole('heading', { name: '服务与资源' }));
        await openResourcesTab(page, '云端服务');
        await expect(apiUrlInput(page)).toHaveValue(ENDPOINT);
    });
});
