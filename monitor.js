// 以太坊合约Deposit监控脚本
const ethers = require('ethers');
const TelegramBot = require('node-telegram-bot-api');

// ========== 配置区域 ==========
const CONFIG = {
  // 以太坊节点URL - 从环境变量读取
  ETH_RPC_URL: process.env.ETH_RPC_URL || '',
  
  // Telegram配置 - 从环境变量读取
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  
  // 合约地址
  TARGET_CONTRACT: '0x6503de9FE77d256d9d823f2D335Ce83EcE9E153f',
  USDT_CONTRACT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  
  // 检查间隔(秒)
  CHECK_INTERVAL: 15
};

// ========== 合约ABI定义 ==========
const DEPOSIT_ABI = [
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event Deposited(address indexed user, address indexed token, uint256 amount)",
  "function deposit(address token, uint256 amount) external"
];

// ========== 主程序 ==========
class ContractMonitor {
  constructor() {
    // 验证配置
    if (!CONFIG.ETH_RPC_URL) {
      throw new Error('缺少ETH_RPC_URL环境变量');
    }
    if (!CONFIG.TELEGRAM_BOT_TOKEN) {
      throw new Error('缺少TELEGRAM_BOT_TOKEN环境变量');
    }
    if (!CONFIG.TELEGRAM_CHAT_ID) {
      throw new Error('缺少TELEGRAM_CHAT_ID环境变量');
    }

    this.provider = new ethers.JsonRpcProvider(CONFIG.ETH_RPC_URL);
    this.contract = new ethers.Contract(
      CONFIG.TARGET_CONTRACT,
      DEPOSIT_ABI,
      this.provider
    );
    this.bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN);
    this.lastProcessedBlock = 0;
  }

  // 初始化
  async init() {
    try {
      // 测试以太坊连接
      const blockNumber = await this.provider.getBlockNumber();
      this.lastProcessedBlock = blockNumber;
      
      console.log(`✅ 监控启动成功!`);
      console.log(`📍 当前区块: ${this.lastProcessedBlock}`);
      console.log(`🎯 监控合约: ${CONFIG.TARGET_CONTRACT}`);
      console.log(`💰 监控代币: USDT (${CONFIG.USDT_CONTRACT})`);
      console.log(`⏰ 检查间隔: ${CONFIG.CHECK_INTERVAL}秒`);
      
      // 测试Telegram连接
      await this.sendTelegramMessage(
        '🤖 <b>监控机器人已启动</b>\n\n' +
        `📍 当前区块: ${blockNumber}\n` +
        `🎯 监控合约: <code>${CONFIG.TARGET_CONTRACT}</code>\n` +
        `💰 监控代币: USDT\n` +
        `⏰ 检查间隔: ${CONFIG.CHECK_INTERVAL}秒\n\n` +
        `正在监控Deposit事件...`
      );
      
      console.log('✅ Telegram连接测试成功');
    } catch (error) {
      console.error('❌ 初始化失败:', error.message);
      throw error;
    }
  }

  // 发送Telegram消息
  async sendTelegramMessage(message) {
    try {
      await this.bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } catch (error) {
      console.error('❌ 发送Telegram消息失败:', error.message);
    }
  }

  // 格式化USDT金额
  formatUSDT(amount) {
    // USDT使用6位小数
    return (Number(amount) / 1e6).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // 监控新区块
  async checkNewBlocks() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      if (currentBlock > this.lastProcessedBlock) {
        const blocksToCheck = currentBlock - this.lastProcessedBlock;
        console.log(`\n🔍 检查区块 ${this.lastProcessedBlock + 1} 到 ${currentBlock} (共${blocksToCheck}个区块)`);
        
        // 查询Deposit事件（尝试不同的事件名称）
        const eventNames = ['Deposit', 'Deposited'];
        let allEvents = [];
        
        for (const eventName of eventNames) {
          try {
            const filter = this.contract.filters[eventName]();
            const events = await this.contract.queryFilter(
              filter,
              this.lastProcessedBlock + 1,
              currentBlock
            );
            allEvents = allEvents.concat(events);
            if (events.length > 0) {
              console.log(`   找到 ${events.length} 个 ${eventName} 事件`);
            }
          } catch (e) {
            // 忽略不存在的事件
          }
        }

        // 处理事件
        if (allEvents.length > 0) {
          for (const event of allEvents) {
            await this.processDepositEvent(event);
          }
        } else {
          console.log(`   ℹ️  未发现存款事件`);
        }

        this.lastProcessedBlock = currentBlock;
      }
    } catch (error) {
      console.error('❌ 检查区块失败:', error.message);
      // 不要退出，继续尝试
    }
  }

  // 处理Deposit事件
  async processDepositEvent(event) {
    try {
      const { user, token, amount } = event.args;
      
      console.log(`\n📥 检测到存款事件:`);
      console.log(`   用户: ${user}`);
      console.log(`   代币: ${token}`);
      console.log(`   原始金额: ${amount.toString()}`);
      
      // 检查是否为USDT存款
      if (token.toLowerCase() === CONFIG.USDT_CONTRACT.toLowerCase()) {
        const usdtAmount = this.formatUSDT(amount);
        const numericAmount = Number(amount) / 1e6;
        
        console.log(`   💰 USDT金额: ${usdtAmount}`);
        
        // 只在金额大于0时通知
        if (numericAmount > 0) {
          console.log(`   ✅ 金额大于0，发送通知`);

          // 发送Telegram通知
          const message = `
🚨 <b>检测到USDT存款</b>

👤 <b>用户:</b> <code>${user}</code>
💵 <b>金额:</b> ${usdtAmount} USDT
📦 <b>区块:</b> ${event.blockNumber}
🔗 <b>交易:</b> <a href="https://etherscan.io/tx/${event.transactionHash}">查看Etherscan</a>

⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
          `.trim();

          await this.sendTelegramMessage(message);
          console.log(`   ✅ Telegram通知已发送`);
        } else {
          console.log(`   ℹ️  金额为0，跳过通知`);
        }
      } else {
        console.log(`   ℹ️  非USDT代币，跳过`);
      }
    } catch (error) {
      console.error('❌ 处理事件失败:', error.message);
      console.error('   事件数据:', event);
    }
  }

  // 启动监控
  async start() {
    await this.init();
    
    // 定期检查新区块
    setInterval(async () => {
      await this.checkNewBlocks();
    }, CONFIG.CHECK_INTERVAL * 1000);

    console.log(`\n🚀 监控循环已启动，每${CONFIG.CHECK_INTERVAL}秒检查一次\n`);
  }
}

// 启动监控
const monitor = new ContractMonitor();
monitor.start().catch((error) => {
  console.error('💥 程序崩溃:', error);
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', async () => {
  console.log('\n\n👋 收到终止信号，监控已停止');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n👋 收到终止信号，监控已停止');
  process.exit(0);
});
```

4. 点击 `Commit new file`

### 3.4 检查清单 ✅

- [ ] GitHub账号已创建
- [ ] 代码仓库已创建
- [ ] package.json文件已添加
- [ ] monitor.js文件已添加

---

## 第四步：部署到Railway云服务

### 4.1 注册Railway账号

1. **访问Railway**
   - 打开：https://railway.app
   - 点击右上角 `Login`

2. **使用GitHub登录**
   - 点击 `Login with GitHub`
   - 授权Railway访问你的GitHub账号
   - 点击 `Authorize Railway`

### 4.2 创建新项目

1. **新建项目**
   - 登录后，点击 `New Project`
   - 选择 `Deploy from GitHub repo`

2. **连接GitHub仓库**
   - 如果第一次使用，点击 `Configure GitHub App`
   - 选择 `Only select repositories`
   - 找到并选择 `eth-contract-monitor`
   - 点击 `Install & Authorize`

3. **选择仓库**
   - 回到Railway页面
   - 在列表中找到 `eth-contract-monitor`
   - 点击这个仓库

4. **等待部署**
   - Railway会自动开始部署
   - 你会看到 `Deploying...` 的提示
   - **此时会失败，因为还没配置环境变量**

### 4.3 配置环境变量

1. **进入项目设置**
   - 在Railway项目页面
   - 点击你的服务（显示为 `eth-contract-monitor`）
   - 点击顶部的 `Variables` 标签

2. **添加环境变量**
   
   点击 `+ New Variable`，逐个添加以下三个变量：

   **变量1：**
   - Variable name: `ETH_RPC_URL`
   - Value: 粘贴你的Infura URL（例如：`https://mainnet.infura.io/v3/你的密钥`）
   - 点击 `Add`

   **变量2：**
   - Variable name: `TELEGRAM_BOT_TOKEN`
   - Value: 粘贴你的Telegram Bot Token（例如：`8232873194:AAEQw8wfl7bMYSeNNu3Gtdr_qicASglTqjw`）
   - 点击 `Add`

   **变量3：**
   - Variable name: `TELEGRAM_CHAT_ID`
   - Value: 粘贴你的Chat ID（例如：`1234567890`）
   - 点击 `Add`

3. **重新部署**
   - 点击顶部的 `Deployments` 标签
   - 点击右上角的三个点 `...`
   - 选择 `Redeploy`
   - 或者直接点击 `Deploy` 按钮

### 4.4 检查部署状态

1. **查看部署日志**
   - 点击最新的部署
   - 点击 `View Logs`
   - 等待几秒钟

2. **确认成功标志**
   - 你应该看到类似这样的日志：
```
   ✅ 监控启动成功!
   📍 当前区块: 18xxxxx
   🎯 监控合约: 0x6503de9FE77d256d9d823f2D335Ce83EcE9E153f
   💰 监控代币: USDT
   ✅ Telegram连接测试成功
   🚀 监控循环已启动
```

3. **检查Telegram**
   - 打开Telegram
   - 你应该收到机器人发来的启动消息：
```
   🤖 监控机器人已启动
   
   📍 当前区块: xxxxx
   🎯 监控合约: 0x6503...
   💰 监控代币: USDT
   ⏰ 检查间隔: 15秒
   
   正在监控Deposit事件...
```

### 4.5 检查清单 ✅

- [ ] Railway账号已注册
- [ ] 项目已创建并连接GitHub
- [ ] 三个环境变量已添加
- [ ] 部署状态显示 `Active` 或 `Success`
- [ ] Telegram收到启动消息

---

## 第五步：测试和监控

### 5.1 确认监控正在运行

1. **检查Railway日志**
   - 在Railway项目页面
   - 点击 `Deployments`
   - 点击最新的部署
   - 点击 `View Logs`
   - 每15秒应该看到类似这样的日志：
```
   🔍 检查区块 18xxxxx 到 18xxxxx
   ℹ️ 未发现存款事件
```

2. **监控运行指标**
   - Railway会显示服务状态为绿色的 `Active`
   - 可以看到CPU和内存使用情况

### 5.2 接收通知

当有人调用合约的deposit函数存入USDT时，你会收到类似这样的Telegram消息：
```
🚨 检测到USDT存款

👤 用户: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
💵 金额: 1,234.56 USDT
📦 区块: 18345678
🔗 交易: 查看Etherscan

⏰ 2024-01-15 14:30:25
