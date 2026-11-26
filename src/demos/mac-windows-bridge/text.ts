// Every visible string of the bridge simulation, Chinese first.
// Host names, addresses and file contents are made-up samples.

const zh = {
  simNote: '这是模拟：不会连接任何电脑，命令输出是事先准备好的示例。只有文件的 SHA-256 是在你的浏览器里真实计算的，文件不会上传。',
  reset: '重置',
  resetDone: '已重置模拟。',
  mac: 'MacBook',
  pc: 'Windows PC',
  gpu: 'RTX 5070 Ti',
  lan: '局域网 · 令牌认证',
  status: { unpaired: '未配对', connecting: '配对中', paired: '已配对' },
  tour: ['配对', '同步剪贴板', '发送文件', '远程命令'],
  tourLabel: '试一遍',

  // pairing
  pairTitle: '配对',
  codeLabel: '配对码',
  codeHint: '在 Mac 上输入这 6 位数字。',
  codeNew: '输错太多次，PC 换了一个新配对码。',
  pcWaiting: '等待 Mac 连接…',
  pcPaired: (host: string) => `已和 ${host} 配对`,
  macHost: 'MacBook-Sample',
  enterLabel: '输入 PC 上显示的配对码',
  fill: '填入配对码',
  pair: '配对',
  unpair: '取消配对',
  errFormat: '配对码是 6 位数字。',
  errWrong: (left: number) => `配对码不对，还能再试 ${left} 次。`,
  errNew: '试错太多次，PC 已经换了新的配对码，请重新输入。',
  steps: {
    discover: { active: '在局域网里查找 Windows PC…', ok: (host: string, ip: string) => `找到 ${host}（${ip}）` },
    verify: { active: '核对配对码…', ok: '配对码正确', failed: '配对码不对，PC 拒绝了连接' },
    token: { active: '交换访问令牌…', ok: (fp: string) => `令牌已交换（${fp}）` },
    paired: { active: '完成配对…', ok: '已配对：之后每个请求都带着这个令牌' },
  },
  connected: (host: string, ip: string) => `已连接 ${host} · ${ip}`,
  tokenLabel: '令牌',
  pairedSay: (host: string) => `已和 ${host} 配对。剪贴板、文件和远程命令都可以用了。`,
  unpairedSay: '已取消配对，PC 显示了新的配对码。',
  pairFirst: '先配对，才能同步和执行命令。',

  // clipboard
  clipTitle: '剪贴板',
  clipMac: 'Mac 剪贴板',
  clipPc: 'PC 剪贴板',
  clipMacHint: '在这里输入或粘贴文字，会同步到 PC。',
  clipPcHint: '在 PC 这边改，也会同步回 Mac。',
  tryLabel: '试试：',
  clipSamples: ['今晚把 qwen3:14b 的测试跑完', 'pip install -r requirements.txt', 'C:\\models\\sample-lora.safetensors'],
  syncing: '同步中…',
  syncedTo: (side: string, bytes: number) => `已同步到 ${side} · ${bytes} 字节`,
  clipEmpty: '剪贴板是空的',

  // files
  filesTitle: '发送文件',
  samplesLabel: '示例文件',
  dropTitle: '或者拖一个你自己的小文件到这里',
  dropButton: '选择文件',
  dropHint: '只在浏览器里读取文件名和大小，并计算 SHA-256，不会上传。最大 50 MB。',
  hashing: '正在计算 SHA-256…',
  sending: (done: number, total: number) => `发送中 · 第 ${done}/${total} 块`,
  verifying: '对方正在校验…',
  sentOk: (name: string) => `${name} 已送达，SHA-256 一致`,
  tooBig: '这个演示最多处理 50 MB 的文件。',
  readFail: '没能读取这个文件。',
  aborted: '连接断开，传输中止。',
  noCrypto: '这个浏览器没法在页面里计算 SHA-256（需要 https 页面）。',
  downloads: '下载',
  downloadsEmpty: '还没有收到文件。',
  chunksOf: (n: number, size: string) => `${n} 块 × ${size}`,
  verified: 'SHA-256 一致',
  mismatch: 'SHA-256 不一致',
  yours: '你的文件',
  sample: '示例',
  receivedSay: (name: string) => `PC 收到 ${name}，重新计算的 SHA-256 和发送前一致。`,
  shaMac: '发送前',
  shaPc: '收到后',
  sampleFiles: {
    config: { name: 'train_config.yaml' },
    notes: { name: '实验记录.md' },
    weights: { name: 'sample-weights.bin' },
  },
  notesContent:
    '# 实验记录（示例）\n\n- 数据：data/sample-images，1200 张示例图片\n- 模型：示例小模型，跑 1 个 epoch\n- 结论：只是演示用的文件内容，没有真实数据。\n',

  // terminal
  termTitle: '终端',
  termSub: '在 Mac 上输入，在 Windows PC 上执行',
  sampleOutput: '示例输出',
  run: '运行',
  stop: '停止',
  inputLabel: '要在 PC 上运行的命令',
  placeholder: '输入命令，或点上面的按钮（↑↓ 翻历史）',
  termEmpty: '点一个命令，看输出一行行传回 Mac。',
  exit: (code: string) => `退出码 ${code}`,
  took: (s: string) => `用时 ${s} 秒`,
  interrupted: '已中断（Ctrl+C）',
  unknown: (list: string) => `这个模拟只认识列表里的命令：${list}。`,
  help: '可以运行的命令：',
  helpLocal: '另外 cls 可以清屏。',
  startSay: (cmd: string) => `在 PC 上运行 ${cmd}`,
  endSay: (cmd: string, code: string, secs: string) => `${cmd} 结束，退出码 ${code}，用时 ${secs} 秒。`,
  stopSay: (cmd: string) => `已发送 Ctrl+C，${cmd} 被中断。`,
  pcRunning: (cmd: string) => `运行中：${cmd}`,
  pcIdle: '空闲',
  pcProcess: '进程',
  failHint: '这条会失败，用来看非零退出码',
};

type Text = typeof zh;

const en: Text = {
  simNote:
    'Simulation: nothing connects to any computer, and the command output is prepared sample text. Only the SHA-256 of a file is really computed, in your browser; the file is never uploaded.',
  reset: 'Reset',
  resetDone: 'Simulation reset.',
  mac: 'MacBook',
  pc: 'Windows PC',
  gpu: 'RTX 5070 Ti',
  lan: 'LAN · token auth',
  status: { unpaired: 'Not paired', connecting: 'Pairing', paired: 'Paired' },
  tour: ['Pair', 'Sync clipboard', 'Send a file', 'Run a command'],
  tourLabel: 'Try it all',

  pairTitle: 'Pairing',
  codeLabel: 'Pairing code',
  codeHint: 'Type these 6 digits on the Mac.',
  codeNew: 'Too many wrong tries, so the PC made a new code.',
  pcWaiting: 'Waiting for the Mac…',
  pcPaired: (host: string) => `Paired with ${host}`,
  macHost: 'MacBook-Sample',
  enterLabel: 'Enter the code shown on the PC',
  fill: 'Fill in the code',
  pair: 'Pair',
  unpair: 'Unpair',
  errFormat: 'The code is 6 digits.',
  errWrong: (left: number) => `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  errNew: 'Too many wrong tries: the PC switched to a new code. Enter the new one.',
  steps: {
    discover: { active: 'Looking for the Windows PC on the LAN…', ok: (host: string, ip: string) => `Found ${host} (${ip})` },
    verify: { active: 'Checking the pairing code…', ok: 'Pairing code accepted', failed: 'Wrong code: the PC refused the connection' },
    token: { active: 'Exchanging an access token…', ok: (fp: string) => `Token exchanged (${fp})` },
    paired: { active: 'Finishing…', ok: 'Paired: every request from now on carries the token' },
  },
  connected: (host: string, ip: string) => `Connected to ${host} · ${ip}`,
  tokenLabel: 'Token',
  pairedSay: (host: string) => `Paired with ${host}. Clipboard, files and remote commands are ready.`,
  unpairedSay: 'Unpaired. The PC shows a new pairing code.',
  pairFirst: 'Pair first to sync and run commands.',

  clipTitle: 'Clipboard',
  clipMac: 'Mac clipboard',
  clipPc: 'PC clipboard',
  clipMacHint: 'Type or paste here; it syncs to the PC.',
  clipPcHint: 'Edit it on the PC side and it syncs back to the Mac.',
  tryLabel: 'Try:',
  clipSamples: ['Finish the qwen3:14b test run tonight', 'pip install -r requirements.txt', 'C:\\models\\sample-lora.safetensors'],
  syncing: 'Syncing…',
  syncedTo: (side: string, bytes: number) => `Synced to the ${side} · ${bytes} bytes`,
  clipEmpty: 'Clipboard is empty',

  filesTitle: 'Send a file',
  samplesLabel: 'Sample files',
  dropTitle: 'Or drop a small file of your own here',
  dropButton: 'Choose a file',
  dropHint: 'Only its name and size are read and its SHA-256 computed, in your browser. Nothing is uploaded. Up to 50 MB.',
  hashing: 'Computing SHA-256…',
  sending: (done: number, total: number) => `Sending · chunk ${done}/${total}`,
  verifying: 'The PC is checking it…',
  sentOk: (name: string) => `${name} arrived; SHA-256 matches`,
  tooBig: 'This demo handles files up to 50 MB.',
  readFail: 'Couldn’t read that file.',
  aborted: 'The link went down; transfer stopped.',
  noCrypto: 'This browser can’t compute SHA-256 on this page (it needs https).',
  downloads: 'Downloads',
  downloadsEmpty: 'No files received yet.',
  chunksOf: (n: number, size: string) => `${n} ${n === 1 ? 'chunk' : 'chunks'} × ${size}`,
  verified: 'SHA-256 verified',
  mismatch: 'SHA-256 mismatch',
  yours: 'your file',
  sample: 'sample',
  receivedSay: (name: string) => `The PC received ${name}; the SHA-256 computed after arrival matches the one before sending.`,
  shaMac: 'Before',
  shaPc: 'After',
  sampleFiles: {
    config: { name: 'train_config.yaml' },
    notes: { name: 'lab-notes.md' },
    weights: { name: 'sample-weights.bin' },
  },
  notesContent:
    '# Lab notes (sample)\n\n- Data: data/sample-images, 1,200 sample images\n- Model: a small sample model, 1 epoch\n- Note: demo file contents only, no real data.\n',

  termTitle: 'Terminal',
  termSub: 'Typed on the Mac, run on the Windows PC',
  sampleOutput: 'Sample output',
  run: 'Run',
  stop: 'Stop',
  inputLabel: 'Command to run on the PC',
  placeholder: 'Type a command or pick one above (↑↓ for history)',
  termEmpty: 'Pick a command and watch its output stream back to the Mac.',
  exit: (code: string) => `exit ${code}`,
  took: (s: string) => `${s} s`,
  interrupted: 'Interrupted (Ctrl+C)',
  unknown: (list: string) => `This simulation only knows the listed commands: ${list}.`,
  help: 'Commands you can run:',
  helpLocal: 'cls clears the screen.',
  startSay: (cmd: string) => `Running ${cmd} on the PC`,
  endSay: (cmd: string, code: string, secs: string) => `${cmd} finished with exit code ${code} in ${secs} s.`,
  stopSay: (cmd: string) => `Sent Ctrl+C; ${cmd} was interrupted.`,
  pcRunning: (cmd: string) => `Running: ${cmd}`,
  pcIdle: 'Idle',
  pcProcess: 'Process',
  failHint: 'This one fails, to show a non-zero exit code',
};

export const TEXT = { zh, en };
export type BridgeText = Text;

/** Contents of the sample YAML (same in both languages). */
export const CONFIG_YAML = `# train_config.yaml (sample)
model: small-cnn
data:
  path: data/sample-images
  val_split: 0.1
train:
  epochs: 1
  batch_size: 32
  lr: 0.001
  seed: 42
device: cuda
output: runs/sample
`;
