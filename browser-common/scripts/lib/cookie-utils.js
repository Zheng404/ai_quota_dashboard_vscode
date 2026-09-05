/**
 * Cookie / 凭证共享工具 — background 子模块公共依赖
 *
 * 收纳被多个子模块（credential / relay / kimi-relay）消费的无状态工具：
 * JWT cookie 启发式挑选、多策略 Cookie 读取、凭证 TTL 常量。
 * 本模块不依赖任何其他 lib 模块（依赖图最底层，杜绝循环引用）。
 */

/** 凭证类 storage.local 条目的保留上限（24h，超时未更新即清除，避免陈旧凭证无限残留） */
export const CREDENTIAL_TTL_MS = 24 * 60 * 60 * 1000;

// JWT 形态 cookie 名的启发式匹配（优先取疑似认证用途的 cookie，避免误扫埋点/A-B 实验 cookie）
const JWT_NAME_PATTERN = /auth|token|session|jwt/i;

/**
 * 从 cookie 列表中挑选最佳 JWT 凭证（二级选择）：
 * 1. 先过滤 value 以 eyJ 开头（JWT 头 base64 特征）；
 * 2. 优先取名字匹配 auth/token/session/jwt 的（多个取第一个）；
 * 3. 无名字匹配时回退取第一个 eyJ 形态 cookie。
 */
export function pickJwtCookie(cookieList) {
  const jwts = cookieList.filter(c => c.value && c.value.startsWith('eyJ'));
  return jwts.find(c => JWT_NAME_PATTERN.test(c.name)) || jwts[0] || null;
}

/** 读取单个 Cookie，支持多策略兜底 */
export async function findCookieByName(url, domain, name) {
  // 策略 1：精确 url 读取
  try {
    const exact = await chrome.cookies.get({ url, name });
    if (exact && exact.value) {
      return exact;
    }
  } catch (err) {
    console.error(`[Cookie] 精确读取 ${url} 的 ${name} 失败:`, err.message);
  }

  // 策略 2：按 url 搜索所有 cookie（覆盖子域、path 不同等场景）
  try {
    const byUrl = await chrome.cookies.getAll({ url });
    const match = byUrl.find(c => c.name === name && c.value);
    if (match) {
      return match;
    }
  } catch (err) {
    console.error(`[Cookie] 按 url 搜索 ${url} 的 ${name} 失败:`, err.message);
  }

  // 策略 3：按 domain 搜索（带点与不带点都尝试）
  if (domain) {
    const domainsToTry = new Set();
    const normalized = domain.startsWith('.') ? domain.slice(1) : domain;
    domainsToTry.add(normalized);
    domainsToTry.add(`.${normalized}`);

    for (const d of domainsToTry) {
      try {
        const all = await chrome.cookies.getAll({ domain: d });
        const match = all.find(c => c.name === name && c.value);
        if (match) {
          return match;
        }
      } catch (err) {
        console.error(`[Cookie] 按 domain ${d} 读取 ${name} 失败:`, err.message);
      }
    }
  }

  // 策略 4：全局枚举并过滤（最后兜底，性能开销可接受）
  try {
    const all = await chrome.cookies.getAll({});
    const match = all.find(c => {
      if (c.name !== name || !c.value) return false;
      if (!domain) return true;
      const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
      return c.domain === domain || c.domain === normalizedDomain ||
        c.domain.endsWith(domain) || c.domain.endsWith(`.${normalizedDomain}`);
    });
    if (match) {
      console.log(`[Cookie] 通过全局搜索找到 ${name} (domain=${match.domain}, path=${match.path})`);
      return match;
    }
  } catch (err) {
    console.error(`[Cookie] 全局搜索 ${name} 失败:`, err.message);
  }

  return null;
}
