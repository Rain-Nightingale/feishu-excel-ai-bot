// ====== 请把引号里的内容换成你自己的（从飞书后台和DeepSeek后台复制） ======
const FEISHU_APP_ID = 'cli_aaac8757dbf89cb6';
const FEISHU_APP_SECRET = 'WL8rlffvqSRiNLwHSV33cdr8cuUPB2Bd';
const AI_API_KEY = 'sk-32f3e9c948db4b6b843ab49de5591d61';
const AI_BASE_URL = 'https://api.deepseek.com/v1';
// =======================================================================

const axios = require('axios');
const XLSX = require('xlsx');

// 获取飞书Token
async function getToken() {
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET
  });
  return res.data.tenant_access_token;
}

// 发送消息
async function sendMessage(chatId, content, token) {
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id=${chatId}`;
  const form = new (require('form-data'))();
  form.append('msg_type', 'text');
  form.append('content', JSON.stringify({ text: content }));
  await axios.post(url, form, { headers: { 'Authorization': `Bearer ${token}`, ...form.getHeaders() } });
}

// 解析Excel（支持多Sheet）
async function parseExcel(fileKey, token) {
  const fileRes = await axios.get(`https://open.feishu.cn/open-apis/im/v1/files/${fileKey}/download`, {
    headers: { 'Authorization': `Bearer ${token}` }, responseType: 'arraybuffer'
  });
  const workbook = XLSX.read(fileRes.data, { type: 'buffer' });
  let resultText = '';
  workbook.SheetNames.forEach(sheetName => {
    const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    resultText += `--- Sheet: ${sheetName} ---\n${csvText}\n\n`;
  });
  return resultText;
}

// 主入口
module.exports = async (req, res) => {
  const body = req.body;
  const token = await getToken();
  if (body.type === 'url_verification') return res.json({ challenge: body.challenge });
  
  if (body.event?.message?.file?.file_key) {
    const { chat_id, file } = body.event.message;
    await sendMessage(chat_id, '📊 收到文件，正在分析多Sheet数据...', token);
    const excelText = await parseExcel(file.file_key, token);
    if (!excelText) return sendMessage(chat_id, '❌ 解析失败', token);

    const aiRes = await axios.post(`${AI_BASE_URL}/chat/completions`, {
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: '你是数据分析师。请根据多Sheet表格数据，分析酒店业绩下滑情况，区分视频/直播/官号/达人渠道。' }, { role: 'user', content: excelText }]
    }, { headers: { 'Authorization': `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' } });
    
    await sendMessage(chat_id, aiRes.data.choices[0].message.content, token);
  }
  res.status(200).send('ok');
};
