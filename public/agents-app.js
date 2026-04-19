import {
  dashboardMeta,
  statusBoard,
  interactionFeed,
  agentRecords,
  rawAgentLogs,
} from './agent-worklog.js';

const elements = {
  pageTitle: document.getElementById('page-title'),
  pageSubtitle: document.getElementById('page-subtitle'),
  lastUpdated: document.getElementById('last-updated'),
  agentCount: document.getElementById('agent-count'),
  statusSummary: document.getElementById('status-summary'),
  latestInteraction: document.getElementById('latest-interaction'),
  projectSummary: document.getElementById('project-summary'),
  statusBoard: document.getElementById('status-board'),
  interactionFeed: document.getElementById('interaction-feed'),
  rawLogList: document.getElementById('raw-log-list'),
  recordStack: document.getElementById('record-stack'),
};

function buildStatusSummary(records) {
  const counts = records.reduce(
    (result, record) => {
      result[record.state] = (result[record.state] || 0) + 1;
      return result;
    },
    {}
  );

  return [
    counts.active ? `${counts.active} 个可继续派工` : null,
    counts.completed ? `${counts.completed} 个已交付` : null,
    counts.standby ? `${counts.standby} 个可继续扩展` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function renderBoardItem(item) {
  return `
    <article class="status-item-card" data-state="${item.state}">
      <div class="status-item-card__top">
        <span class="status-item-card__code">${item.code}</span>
        <span class="status-item-card__state">${item.stateLabel}</span>
      </div>
      <p class="status-item-card__focus">${item.focus}</p>
      <p class="status-item-card__effect">${item.effect}</p>
    </article>
  `;
}

function renderInteraction(entry) {
  return `
    <article class="feed-item">
      <div class="feed-item__head">
        <span class="feed-item__time">${entry.time}</span>
        <span class="feed-item__kind">${entry.kind}</span>
      </div>
      <h3 class="feed-item__title">${entry.title}</h3>
      <p class="feed-item__route">${entry.from} -> ${entry.to}</p>
      <p class="feed-item__detail">${entry.detail}</p>
      <p class="feed-item__effect">效果：${entry.effect}</p>
    </article>
  `;
}

function renderAssignment(assignment) {
  return `
    <article class="assignment-card">
      <h4 class="assignment-card__title">${assignment.title}</h4>
      <p class="assignment-card__request">收到的任务：${assignment.request}</p>
      <div class="assignment-card__body">
        <section class="assignment-block">
          <p class="section-label">执行动作</p>
          <ul>
            ${assignment.actions.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </section>
        <section class="assignment-block">
          <p class="section-label">结果与效果</p>
          <ul>
            <li>结果：${assignment.result}</li>
            <li>效果：${assignment.effect}</li>
          </ul>
        </section>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderRawLog(entry) {
  return `
    <article class="raw-log-card">
      <div class="raw-log-card__head">
        <div class="raw-log-card__meta">
          <span class="raw-log-card__agent">${entry.agent}</span>
          <span class="raw-log-card__kind">${entry.kind}</span>
        </div>
        <h3 class="raw-log-card__title">${entry.title}</h3>
      </div>
      <pre class="raw-log-card__body"><code>${escapeHtml(entry.body)}</code></pre>
    </article>
  `;
}

function renderRecord(record) {
  return `
    <article class="record-card card" data-state="${record.state}">
      <div class="record-card__head">
        <div>
          <div class="record-card__title">
            <span class="record-card__code">${record.code}</span>
            <div>
              <h2 class="record-card__name">${record.displayName}</h2>
              <p class="record-card__role">${record.role}</p>
            </div>
          </div>
        </div>
        <span class="record-card__state">${record.stateLabel}</span>
      </div>

      <div class="record-meta-grid">
        <section class="subcard">
          <p class="section-label">当前状态</p>
          <h3>现在在盯什么</h3>
          <p class="copy-block">${record.currentFocus}</p>
        </section>

        <section class="subcard">
          <p class="section-label">负责文件</p>
          <h3>主要写入位置</h3>
          <ul class="file-list">
            ${record.ownedFiles.map((file) => `<li><code>${file}</code></li>`).join('')}
          </ul>
        </section>
      </div>

      <section class="assignment-stack">
        <div class="assignment-stack__head">
          <p class="section-label">详细任务记录</p>
          <h3>这个 agent 新做了什么，有什么效果</h3>
        </div>
        ${record.assignments.map(renderAssignment).join('')}
      </section>
    </article>
  `;
}

function render() {
  elements.pageTitle.textContent = dashboardMeta.title;
  elements.pageSubtitle.textContent = dashboardMeta.subtitle;
  elements.lastUpdated.textContent = dashboardMeta.lastUpdated;
  elements.agentCount.textContent = String(agentRecords.length);
  elements.statusSummary.textContent = buildStatusSummary(statusBoard);
  elements.latestInteraction.textContent = interactionFeed.at(-1)?.title || '暂无';
  elements.projectSummary.textContent = dashboardMeta.summary;
  elements.statusBoard.innerHTML = statusBoard.map(renderBoardItem).join('');
  elements.interactionFeed.innerHTML = interactionFeed.map(renderInteraction).join('');
  elements.rawLogList.innerHTML = rawAgentLogs.map(renderRawLog).join('');
  elements.recordStack.innerHTML = agentRecords.map(renderRecord).join('');
}

render();
