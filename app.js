const DB_NAME = "beibei-food-store";
const DB_VERSION = 1;
const STORE_NAME = "kv";

const CATEGORIES = [
  { key: "homeCook", name: "家里做的" },
  { key: "outside", name: "外面吃的" },
  { key: "fastFood", name: "速食" },
  { key: "fruit", name: "水果" },
  { key: "drink", name: "饮品" }
];

const PLATFORMS = ["抖音", "小红书", "大众点评", "美团", "朋友推荐", "其他"];
const PLAN_STATUS = ["想去", "已安排", "已吃过", "暂不去"];
const PLAN_PRIORITY = ["普通", "想去", "必吃"];
const REMARKS = [
  { text: "爆好吃", tone: "pink" },
  { text: "人上人", tone: "amber" },
  { text: "一般般", tone: "blue" },
  { text: "再接再厉", tone: "mint" },
  { text: "不合口味", tone: "danger" }
];

const defaultState = () => ({
  version: 1,
  settings: {
    shopName: "贝贝的小食铺",
    avatar: ""
  },
  foods: [],
  cart: [],
  plans: []
});

const app = {
  state: defaultState(),
  tab: "kitchen",
  category: "homeCook",
  search: "",
  planSearch: "",
  planStatus: "全部",
  manageMode: false
};

const view = document.querySelector("#view");
const modal = document.querySelector("#modal");
const toastEl = document.querySelector("#toast");
const LONG_PRESS_MS = 800;
let categoryPressTimer = 0;
let categoryPressStart = null;
let ignoreNextCategoryClick = false;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadState() {
  try {
    const saved = await dbGet("state");
    app.state = saved ? normalizeState(saved) : defaultState();
  } catch (error) {
    const fallback = localStorage.getItem("beibei-food-state");
    app.state = fallback ? normalizeState(JSON.parse(fallback)) : defaultState();
  }
}

async function saveState() {
  app.state.version = 1;
  try {
    await dbSet("state", app.state);
  } catch (error) {
    localStorage.setItem("beibei-food-state", JSON.stringify(app.state));
  }
}

function normalizeState(value) {
  const fresh = defaultState();
  return {
    ...fresh,
    ...value,
    settings: { ...fresh.settings, ...(value.settings || {}) },
    foods: Array.isArray(value.foods) ? value.foods : [],
    cart: Array.isArray(value.cart) ? value.cart : [],
    plans: Array.isArray(value.plans) ? value.plans : []
  };
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl(value) {
  return esc(value).replaceAll("\n", "<br>");
}

function getCategoryName(key) {
  return (CATEGORIES.find(item => item.key === key) || CATEGORIES[0]).name;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => toastEl.classList.add("hidden"), 1900);
}

function imageHtml(src, label = "无图片") {
  return src
    ? `<img class="thumb" src="${src}" alt="${esc(label)}">`
    : `<div class="thumb">${esc(label)}</div>`;
}

function setActiveTab() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === app.tab);
  });
}

function render() {
  setActiveTab();
  if (app.tab === "kitchen") renderKitchen();
  if (app.tab === "order") renderOrder();
  if (app.tab === "plan") renderPlan();
  if (app.tab === "backup") renderBackup();
}

function renderKitchen() {
  const { settings, foods } = app.state;
  const filtered = foods
    .filter(food => food.category === app.category)
    .filter(food => !app.search || [food.name, food.desc, food.recipe].some(text => String(text || "").toLowerCase().includes(app.search.toLowerCase())))
    .sort((a, b) => Math.abs(dateDistance(a.eatDate)) - Math.abs(dateDistance(b.eatDate)));

  view.innerHTML = `
    <section class="page kitchen-page">
      <header class="top-header">
        ${settings.avatar ? `<img class="logo-avatar" src="${settings.avatar}" alt="头像" data-action="edit-shop">` : `<button class="logo-avatar" data-action="edit-shop">👧</button>`}
        <h1 class="title">${esc(settings.shopName)}</h1>
        <div class="search-box">
          <input class="search-input" data-field="kitchen-search" placeholder="搜索菜品" value="${esc(app.search)}">
        </div>
        ${app.manageMode ? `<button class="manage-tip" data-action="exit-manage">退出</button>` : ""}
      </header>
      <div class="container">
        <aside class="left-category">
          ${CATEGORIES.map(cat => `<button class="category-item ${cat.key === app.category ? "active" : ""}" data-action="switch-category" data-category="${cat.key}"><span class="category-icon">${categoryIcon(cat.key)}</span><span>${cat.name}</span></button>`).join("")}
        </aside>
        <div class="right-food-list">
          ${filtered.map(foodCard).join("") || `<div class="empty-tip">${app.search ? "未找到匹配的菜品" : "该分类暂无菜品，点击底部中间加号添加菜品"}</div>`}
        </div>
      </div>
      <button class="mid-add-btn" data-action="open-food-form" aria-label="添加菜品"><span class="plus">+</span></button>
    </section>
  `;
}

function foodCard(food) {
  const remark = food.remark ? `<div class="food-remark-tag">${esc(food.remark.text)}</div>` : "";
  return `
    <article class="card food-card" data-action="food-detail" data-id="${food.id}">
      ${remark}
      ${app.manageMode ? `<button class="del-food-btn" data-action="delete-food" data-id="${food.id}">删除</button>` : ""}
      ${imageHtml(food.image, "菜品图")}
      <div class="food-info">
        <div class="food-name">${esc(food.name)}</div>
        <div class="food-alias">${esc(food.desc || getCategoryName(food.category))}</div>
        <div class="food-price">¥${money(food.price)}</div>
      </div>
      ${app.manageMode ? "" : `<button class="add-circle" data-action="add-cart" data-id="${food.id}" aria-label="加入菜单">+</button>`}
    </article>
  `;
}

function categoryIcon(key) {
  return {
    homeCook: '<img src="assets/icon-home-cook.png" alt="">',
    outside: '<img src="assets/icon-outside.png" alt="">',
    fastFood: '<img src="assets/icon-fast-food.png" alt="">',
    fruit: '<img src="assets/icon-fruit.png" alt="">',
    drink: '<img src="assets/icon-drink.png" alt="">'
  }[key] || "";
}

function renderOrder() {
  const items = app.state.cart
    .map(cartItem => ({ ...cartItem, food: app.state.foods.find(food => food.id === cartItem.foodId) }))
    .filter(item => item.food);
  const total = items.reduce((sum, item) => sum + Number(item.food.price || 0) * item.count, 0);

  view.innerHTML = `
    <section class="page page-wrap">
      <header class="page-head">
        <h1 class="page-title">本次菜单</h1>
      </header>
      <div class="summary-panel">
        <div class="summary-line"><span>菜品数量</span><strong>${items.reduce((sum, item) => sum + item.count, 0)}</strong></div>
        <div class="summary-line"><span>预估合计</span><span class="total">¥${money(total)}</span></div>
        ${items.length ? `<button class="danger-btn" data-action="clear-cart">清空菜单</button>` : ""}
      </div>
      <div class="grid">
        ${items.map(orderCard).join("") || `<div class="empty-tip">菜单为空，去厨房点击加号加购菜品</div>`}
      </div>
    </section>
  `;
}

function orderCard(item) {
  const food = item.food;
  return `
    <article class="card order-card">
      ${imageHtml(food.image, "菜品图")}
      <div class="food-info order-info">
        <div class="food-name">${esc(food.name)}</div>
        <div class="food-alias">${esc(getCategoryName(food.category))}</div>
        <div class="food-price">单价 ¥${money(food.price)}</div>
        <div class="subtotal">小计 ¥${money(Number(food.price || 0) * item.count)}</div>
        <div class="actions order-actions">
          <div class="count-control" aria-label="数量">
            <button data-action="sub-cart" data-id="${food.id}">-</button>
            <span>${item.count}</span>
            <button data-action="add-cart" data-id="${food.id}">+</button>
          </div>
          <button class="danger-btn" data-action="remove-cart" data-id="${food.id}">移除</button>
        </div>
      </div>
    </article>
  `;
}

function renderPlan() {
  const statuses = ["全部", ...PLAN_STATUS];
  const list = app.state.plans
    .filter(plan => app.planStatus === "全部" || plan.status === app.planStatus)
    .filter(plan => !app.planSearch || [plan.restaurantName, plan.location, plan.recommendedDishes, plan.reason, plan.notes].some(text => String(text || "").toLowerCase().includes(app.planSearch.toLowerCase())))
    .sort(comparePlan);
  const reminders = app.state.plans
    .filter(plan => {
      const distance = dateDistance(plan.planDate);
      return distance >= 0 && distance <= 7 && !["已吃过", "暂不去"].includes(plan.status);
    })
    .sort(comparePlan)
    .slice(0, 3);

  view.innerHTML = `
    <section class="page plan-page">
      <header class="page-head">
        <h1 class="page-title">想吃计划</h1>
      </header>
      <div class="plan-toolbar">
        <input class="search" data-field="plan-search" placeholder="搜索餐厅、地点、推荐菜" value="${esc(app.planSearch)}">
      </div>
      <div class="chip-row">
        ${statuses.map(status => `<button class="chip ${status === app.planStatus ? "active" : ""}" data-action="filter-plan" data-status="${status}">${status}</button>`).join("")}
      </div>
      ${reminders.length ? `<div class="reminder-panel">${reminders.map(reminderLine).join("")}</div>` : ""}
      <div class="grid plan-grid">
        ${list.map(planCard).join("") || `<div class="empty-tip">暂无计划菜单，记录一个想吃的地方吧</div>`}
      </div>
      <button class="plan-add-btn" data-action="open-plan-form" aria-label="添加计划">+</button>
    </section>
  `;
}

function reminderLine(plan) {
  return `
    <button class="reminder-item" data-action="plan-detail" data-id="${plan.id}">
      <span class="reminder-date">${esc(reminderText(plan.planDate))}</span>
      <span class="reminder-name">${esc(plan.restaurantName)}</span>
      <span class="reminder-location">${esc(plan.location || "未填地点")}</span>
    </button>
  `;
}

function planCard(plan) {
  return `
    <article class="card plan-card" data-action="plan-detail" data-id="${plan.id}">
      ${imageHtml(plan.image, "计划图")}
      <div class="plan-card-main">
        <div class="plan-card-head">
          <div class="plan-title-wrap">
            <div class="plan-name">${esc(plan.restaurantName)}</div>
            <div class="plan-location">${esc(plan.location || "未填写地点")}</div>
          </div>
          <span class="priority-tag ${priorityTone(plan.priority)}">${esc(plan.priority || "想去")}</span>
        </div>
        <div class="plan-meta">
          <span>${esc(plan.platform || "其他平台")}</span>
          <span>${esc(plan.status || "想去")}</span>
          <span>${esc(plan.planDate || "待定")}</span>
        </div>
        ${plan.recommendedDishes ? `<div class="dish-line"><span class="label">推荐菜</span><span class="value">${esc(plan.recommendedDishes)}</span></div>` : ""}
        <div class="card-actions">
          <button class="plan-action-btn plan-secondary-btn" data-action="open-plan-form" data-id="${plan.id}">编辑</button>
          <button class="plan-action-btn plan-danger-btn" data-action="delete-plan" data-id="${plan.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderBackup() {
  const size = new Blob([JSON.stringify(app.state)]).size;
  view.innerHTML = `
    <section class="page page-wrap">
      <header class="page-head">
        <h1 class="page-title">本地备份</h1>
      </header>
      <div class="backup-box">
        <div class="summary-line"><span>菜品</span><strong>${app.state.foods.length}</strong></div>
        <div class="summary-line"><span>菜单项</span><strong>${app.state.cart.length}</strong></div>
        <div class="summary-line"><span>想吃计划</span><strong>${app.state.plans.length}</strong></div>
        <div class="summary-line"><span>本地数据大小</span><strong>${Math.ceil(size / 1024)} KB</strong></div>
      </div>
      <div class="backup-box">
        <button class="primary-btn" data-action="export-data">导出备份文件</button>
        <label>
          <span class="label">导入备份文件</span>
          <input class="field" type="file" accept="application/json,.json" data-field="import-data">
        </label>
      </div>
      <div class="backup-box">
        <button class="secondary-btn" data-action="edit-shop">修改店铺名称和头像</button>
        <button class="danger-btn" data-action="wipe-data">清空本地数据</button>
      </div>
    </section>
  `;
}

function priorityTone(priority) {
  if (priority === "必吃") return "pink";
  if (priority === "普通") return "blue";
  return "amber";
}

function dateDistance(dateText) {
  if (!dateText) return Number.POSITIVE_INFINITY;
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function reminderText(dateText) {
  const distance = dateDistance(dateText);
  if (!Number.isFinite(distance)) return "待定";
  if (distance === 0) return "今天";
  if (distance === 1) return "明天";
  if (distance < 0) return "已过期";
  return `${distance}天后`;
}

function comparePlan(a, b) {
  const da = dateDistance(a.planDate);
  const db = dateDistance(b.planDate);
  if (da !== db) return da - db;
  const weight = { "必吃": 3, "想去": 2, "普通": 1 };
  return (weight[b.priority] || 2) - (weight[a.priority] || 2);
}

function openModal(html) {
  modal.innerHTML = html;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  modal.innerHTML = "";
}

function sheet(title, body) {
  return `
    <section class="sheet" role="dialog" aria-modal="true">
      <header class="sheet-head">
        <h2 class="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" data-action="close-modal" aria-label="关闭">关闭</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>
  `;
}

function openFoodForm(foodId = "") {
  const food = app.state.foods.find(item => item.id === foodId);
  const body = `
    <form class="form-grid" id="food-form">
      <label>
        <span class="label">菜品图片</span>
        <div class="image-preview" id="food-preview">${food?.image ? `<img src="${food.image}" alt="菜品图片">` : "选择一张照片"}</div>
        <input class="field" name="image" type="file" accept="image/*">
      </label>
      <label><span class="label">菜品名称 *</span><input class="field" name="name" maxlength="24" required value="${esc(food?.name || "")}"></label>
      <label><span class="label">简短描述</span><input class="field" name="desc" maxlength="40" value="${esc(food?.desc || "")}"></label>
      <div class="form-row">
        <label><span class="label">分类</span><select class="select" name="category">${CATEGORIES.map(cat => `<option value="${cat.key}" ${cat.key === (food?.category || app.category) ? "selected" : ""}>${cat.name}</option>`).join("")}</select></label>
        <label><span class="label">就餐日期 *</span><input class="field" name="eatDate" type="date" required value="${esc(food?.eatDate || today())}"></label>
      </div>
      <label><span class="label">价格 *</span><input class="field" name="price" type="number" min="0" max="9999" step="0.01" required value="${esc(food?.price ?? "")}"></label>
      <label><span class="label">做法 / 备注</span><textarea class="textarea" name="recipe" maxlength="500">${esc(food?.recipe || "")}</textarea></label>
      <button class="primary-btn" type="submit">${food ? "保存修改" : "添加菜品"}</button>
      ${food ? `<button class="danger-btn" type="button" data-action="delete-food" data-id="${food.id}">删除菜品</button>` : ""}
    </form>
  `;
  openModal(sheet(food ? "编辑菜品" : "新增菜品", body));
  bindImagePreview("#food-form input[name=image]", "#food-preview");
  document.querySelector("#food-form").addEventListener("submit", event => saveFoodForm(event, food));
}

async function saveFoodForm(event, oldFood) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("image");
  let image = oldFood?.image || "";
  if (file && file.size) image = await compressImage(file);
  if (!image) {
    toast("请先选择菜品图片");
    return;
  }
  const data = {
    id: oldFood?.id || id(),
    name: String(form.get("name")).trim(),
    desc: String(form.get("desc")).trim(),
    price: Number(form.get("price")),
    recipe: String(form.get("recipe")).trim(),
    image,
    category: String(form.get("category")),
    eatDate: String(form.get("eatDate")),
    remark: oldFood?.remark || null,
    createdAt: oldFood?.createdAt || new Date().toISOString()
  };
  if (!data.name || !Number.isFinite(data.price) || data.price < 0) {
    toast("菜品名称和价格需要填写正确");
    return;
  }
  if (oldFood) {
    app.state.foods = app.state.foods.map(food => food.id === oldFood.id ? data : food);
  } else {
    app.state.foods.push(data);
    app.category = data.category;
  }
  await saveState();
  closeModal();
  render();
  toast(oldFood ? "菜品已保存" : "菜品已添加");
}

function openFoodDetail(foodId) {
  const food = app.state.foods.find(item => item.id === foodId);
  if (!food) return;
  const body = `
    <div class="detail-stack">
      ${food.image ? `<img class="detail-img" src="${food.image}" alt="${esc(food.name)}">` : ""}
      <div class="detail-section">
        <div class="card-head">
          <div>
            <div class="name">${esc(food.name)}</div>
            <div class="meta">${esc(getCategoryName(food.category))} · ${esc(food.eatDate || "未填写日期")}</div>
          </div>
          <div class="price">¥${money(food.price)}</div>
        </div>
      </div>
      <div class="detail-section">${nl(food.recipe || food.desc || "暂无更多记录")}</div>
      <div class="chip-row">
        ${REMARKS.map(remark => `<button class="chip" data-action="set-remark" data-id="${food.id}" data-remark="${esc(remark.text)}">${remark.text}</button>`).join("")}
      </div>
      <div class="actions">
        <button class="primary-btn" data-action="add-cart" data-id="${food.id}">加入菜单</button>
        <button class="secondary-btn" data-action="open-food-form" data-id="${food.id}">编辑</button>
        ${food.remark ? `<button class="secondary-btn" data-action="clear-remark" data-id="${food.id}">取消评价</button>` : ""}
      </div>
    </div>
  `;
  openModal(sheet("菜品详情", body));
}

function openPlanForm(planId = "") {
  const plan = app.state.plans.find(item => item.id === planId);
  const body = `
    <form class="form-grid" id="plan-form">
      <label>
        <span class="label">图片</span>
        <div class="image-preview" id="plan-preview">${plan?.image ? `<img src="${plan.image}" alt="计划图片">` : "可选：选择餐厅或截图照片"}</div>
        <input class="field" name="image" type="file" accept="image/*">
      </label>
      <label><span class="label">餐厅名称 *</span><input class="field" name="restaurantName" maxlength="30" required value="${esc(plan?.restaurantName || "")}"></label>
      <label><span class="label">地点位置</span><input class="field" name="location" maxlength="60" value="${esc(plan?.location || "")}"></label>
      <div class="form-row">
        <label><span class="label">大概价格</span><input class="field" name="avgPrice" value="${esc(plan?.avgPrice || "")}"></label>
        <label><span class="label">计划日期</span><input class="field" name="planDate" type="date" value="${esc(plan?.planDate || "")}"></label>
      </div>
      <label><span class="label">推荐菜</span><input class="field" name="recommendedDishes" maxlength="80" value="${esc(plan?.recommendedDishes || "")}"></label>
      <div class="form-row">
        <label><span class="label">平台</span><select class="select" name="platform">${PLATFORMS.map(item => `<option ${item === (plan?.platform || "抖音") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label><span class="label">状态</span><select class="select" name="status">${PLAN_STATUS.map(item => `<option ${item === (plan?.status || "想去") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      </div>
      <label><span class="label">想去程度</span><select class="select" name="priority">${PLAN_PRIORITY.map(item => `<option ${item === (plan?.priority || "想去") ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      <label><span class="label">原分享链接</span><input class="field" name="sourceLink" type="url" value="${esc(plan?.sourceLink || "")}"></label>
      <label><span class="label">想吃原因</span><textarea class="textarea" name="reason" maxlength="200">${esc(plan?.reason || "")}</textarea></label>
      <label><span class="label">备注</span><textarea class="textarea" name="notes" maxlength="200">${esc(plan?.notes || "")}</textarea></label>
      <button class="primary-btn" type="submit">${plan ? "保存修改" : "添加计划"}</button>
    </form>
  `;
  openModal(sheet(plan ? "编辑计划" : "新增计划", body));
  bindImagePreview("#plan-form input[name=image]", "#plan-preview");
  document.querySelector("#plan-form").addEventListener("submit", event => savePlanForm(event, plan));
}

async function savePlanForm(event, oldPlan) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("image");
  let image = oldPlan?.image || "";
  if (file && file.size) image = await compressImage(file);
  const data = {
    id: oldPlan?.id || id(),
    restaurantName: String(form.get("restaurantName")).trim(),
    location: String(form.get("location")).trim(),
    avgPrice: String(form.get("avgPrice")).trim(),
    recommendedDishes: String(form.get("recommendedDishes")).trim(),
    platform: String(form.get("platform")),
    sourceLink: String(form.get("sourceLink")).trim(),
    image,
    reason: String(form.get("reason")).trim(),
    planDate: String(form.get("planDate")),
    status: String(form.get("status")),
    priority: String(form.get("priority")),
    notes: String(form.get("notes")).trim(),
    createdAt: oldPlan?.createdAt || new Date().toISOString()
  };
  if (!data.restaurantName) {
    toast("请填写餐厅名称");
    return;
  }
  if (oldPlan) {
    app.state.plans = app.state.plans.map(plan => plan.id === oldPlan.id ? data : plan);
  } else {
    app.state.plans.push(data);
  }
  await saveState();
  closeModal();
  render();
  toast(oldPlan ? "计划已保存" : "计划已添加");
}

function openPlanDetail(planId) {
  const plan = app.state.plans.find(item => item.id === planId);
  if (!plan) return;
  const link = plan.sourceLink ? `<a class="secondary-btn" href="${esc(plan.sourceLink)}" target="_blank" rel="noopener">打开链接</a>` : "";
  const body = `
    <div class="detail-stack">
      ${plan.image ? `<img class="detail-img" src="${plan.image}" alt="${esc(plan.restaurantName)}">` : ""}
      <div class="detail-section">
        <div class="card-head">
          <div>
            <div class="name">${esc(plan.restaurantName)}</div>
            <div class="meta">${esc(plan.location || "未填地点")}</div>
          </div>
          <span class="tag ${priorityTone(plan.priority)}">${esc(plan.priority || "想去")}</span>
        </div>
        <p class="small">${esc(plan.platform || "其他")} · ${esc(plan.status || "想去")} · ${esc(plan.planDate || "待定")}</p>
      </div>
      ${plan.recommendedDishes ? `<div class="detail-section"><strong>推荐菜</strong><br>${nl(plan.recommendedDishes)}</div>` : ""}
      ${plan.reason ? `<div class="detail-section"><strong>想吃原因</strong><br>${nl(plan.reason)}</div>` : ""}
      ${plan.notes ? `<div class="detail-section"><strong>备注</strong><br>${nl(plan.notes)}</div>` : ""}
      <div class="actions">
        ${link}
        <button class="primary-btn" data-action="open-plan-form" data-id="${plan.id}">编辑</button>
      </div>
    </div>
  `;
  openModal(sheet("计划详情", body));
}

function bindImagePreview(inputSelector, previewSelector) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    preview.innerHTML = `<img src="${dataUrl}" alt="预览">`;
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片读取失败"));
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addCart(foodId) {
  const item = app.state.cart.find(cartItem => cartItem.foodId === foodId);
  if (item) item.count += 1;
  else app.state.cart.push({ foodId, count: 1 });
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const foodId = target.dataset.id;

  if (action === "close-modal") closeModal();
  if (action === "exit-manage") {
    app.manageMode = false;
    render();
    return;
  }
  if (action === "switch-category") {
    if (ignoreNextCategoryClick) {
      ignoreNextCategoryClick = false;
      return;
    }
    if (app.manageMode) return;
    app.category = target.dataset.category;
    app.search = "";
    render();
  }
  if (action === "open-food-form") openFoodForm(foodId);
  if (action === "food-detail" && !app.manageMode) openFoodDetail(foodId);
  if (action === "add-cart") {
    if (app.manageMode) return;
    addCart(foodId);
    await saveState();
    render();
    toast("已加入菜单");
  }
  if (action === "sub-cart") {
    const item = app.state.cart.find(cartItem => cartItem.foodId === foodId);
    if (item && item.count > 1) item.count -= 1;
    else app.state.cart = app.state.cart.filter(cartItem => cartItem.foodId !== foodId);
    await saveState();
    render();
  }
  if (action === "remove-cart") {
    app.state.cart = app.state.cart.filter(cartItem => cartItem.foodId !== foodId);
    await saveState();
    render();
  }
  if (action === "clear-cart" && confirm("确定清空本次菜单吗？")) {
    app.state.cart = [];
    await saveState();
    render();
  }
  if (action === "delete-food" && confirm("确定删除这个菜品吗？")) {
    app.state.foods = app.state.foods.filter(food => food.id !== foodId);
    app.state.cart = app.state.cart.filter(item => item.foodId !== foodId);
    await saveState();
    closeModal();
    render();
    toast("删除成功");
  }
  if (action === "set-remark") {
    const remark = REMARKS.find(item => item.text === target.dataset.remark);
    app.state.foods = app.state.foods.map(food => food.id === foodId ? { ...food, remark } : food);
    await saveState();
    openFoodDetail(foodId);
    toast("评价已保存");
  }
  if (action === "clear-remark") {
    app.state.foods = app.state.foods.map(food => food.id === foodId ? { ...food, remark: null } : food);
    await saveState();
    openFoodDetail(foodId);
  }
  if (action === "filter-plan") {
    app.planStatus = target.dataset.status;
    render();
  }
  if (action === "open-plan-form") openPlanForm(foodId);
  if (action === "plan-detail") openPlanDetail(foodId);
  if (action === "delete-plan" && confirm("确定删除这条想吃计划吗？")) {
    app.state.plans = app.state.plans.filter(plan => plan.id !== foodId);
    await saveState();
    render();
  }
  if (action === "export-data") exportData();
  if (action === "edit-shop") openShopForm();
  if (action === "wipe-data" && confirm("这会删除本机所有菜品、菜单和计划，确定继续吗？")) {
    app.state = defaultState();
    await saveState();
    render();
  }
}

function handlePointerDown(event) {
  const target = event.target.closest("[data-action='switch-category']");
  if (!target || app.tab !== "kitchen") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  window.clearTimeout(categoryPressTimer);
  categoryPressStart = {
    x: event.clientX,
    y: event.clientY,
    category: target.dataset.category
  };
  categoryPressTimer = window.setTimeout(() => {
    app.category = categoryPressStart.category;
    app.search = "";
    app.manageMode = !app.manageMode;
    ignoreNextCategoryClick = true;
    render();
    toast(app.manageMode ? "已进入管理模式" : "已退出管理模式");
  }, LONG_PRESS_MS);
}

function handlePointerMove(event) {
  if (!categoryPressStart) return;
  const moveX = Math.abs(event.clientX - categoryPressStart.x);
  const moveY = Math.abs(event.clientY - categoryPressStart.y);
  if (moveX > 10 || moveY > 10) clearCategoryPress();
}

function clearCategoryPress() {
  window.clearTimeout(categoryPressTimer);
  categoryPressTimer = 0;
  categoryPressStart = null;
}

function handleContextMenu(event) {
  if (event.target.closest("[data-action='switch-category']")) {
    event.preventDefault();
  }
}

function handleInput(event) {
  const field = event.target.dataset.field;
  if (field === "kitchen-search") {
    app.search = event.target.value.trim();
    renderKitchen();
  }
  if (field === "plan-search") {
    app.planSearch = event.target.value.trim();
    renderPlan();
  }
}

async function handleChange(event) {
  const field = event.target.dataset.field;
  if (field !== "import-data") return;
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = normalizeState(JSON.parse(text));
    if (!confirm("导入会覆盖当前本地数据，确定继续吗？")) return;
    app.state = imported;
    await saveState();
    render();
    toast("备份已导入");
  } catch (error) {
    toast("备份文件读取失败");
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(app.state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `beibei-food-backup-${today()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openShopForm() {
  const { shopName, avatar } = app.state.settings;
  const body = `
    <form class="form-grid" id="shop-form">
      <label><span class="label">店铺名称</span><input class="field" name="shopName" maxlength="20" required value="${esc(shopName)}"></label>
      <label>
        <span class="label">头像</span>
        <div class="image-preview" id="shop-preview">${avatar ? `<img src="${avatar}" alt="头像">` : "可选：选择头像"}</div>
        <input class="field" name="avatar" type="file" accept="image/*">
      </label>
      <button class="primary-btn" type="submit">保存</button>
    </form>
  `;
  openModal(sheet("店铺设置", body));
  bindImagePreview("#shop-form input[name=avatar]", "#shop-preview");
  document.querySelector("#shop-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("avatar");
    let nextAvatar = avatar;
    if (file && file.size) nextAvatar = await compressImage(file);
    app.state.settings = {
      shopName: String(form.get("shopName")).trim() || "贝贝的小食铺",
      avatar: nextAvatar
    };
    await saveState();
    closeModal();
    render();
  });
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    app.tab = btn.dataset.tab;
    app.manageMode = false;
    closeModal();
    render();
  });
});

document.addEventListener("click", handleClick);
document.addEventListener("pointerdown", handlePointerDown);
document.addEventListener("pointermove", handlePointerMove);
document.addEventListener("pointerup", clearCategoryPress);
document.addEventListener("pointercancel", clearCategoryPress);
document.addEventListener("contextmenu", handleContextMenu);
document.addEventListener("input", handleInput);
document.addEventListener("change", handleChange);
modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

async function start() {
  await loadState();
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

start();
