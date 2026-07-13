"use strict";

const COMPACT_HINT = "默认输出已隐藏较大的 action 详情、schema 和接口映射；需要完整业务数据请追加 --data-only，排障请追加 --raw。";
const MAX_ACTION_NAMES = 12;
const MAX_ACTIONS = 20;
const MAX_MATCHED_ACTIONS = 8;
const MAX_TASKS = 50;
const MAX_GROUP_TASKS = 20;

function compactMetadataCallData(toolName, data, args = {}) {
  if (!String(toolName || "").startsWith("yeelight_metadata.")) {
    return unchanged(data);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return unchanged(data);
  }

  if (toolName === "yeelight_metadata.list_tasks") {
    return compactResult(data, (result) => compactListTasksResult(result, args));
  }
  return unchanged(data);
}

function compactResult(data, compactFn) {
  const wrapped = data && typeof data.result === "object" && data.result !== null && !Array.isArray(data.result);
  const source = wrapped ? data.result : data;
  const compacted = compactFn(source);
  if (!compacted) {
    return unchanged(data);
  }
  return {
    data: wrapped ? { ...data, result: compacted } : compacted,
    compacted: true,
    hint: COMPACT_HINT,
  };
}

function compactListTasksResult(result, args) {
  if (args && args.task) {
    return compactDescribeTaskResult(result);
  }
  if ((args && args.query) || Array.isArray(result.matches)) {
    return compactSearchTasksResult(result);
  }

  const displayLimit = getDisplayLimit(args, MAX_TASKS);
  const sourceTasks = Array.isArray(result.items) ? result.items : result.tasks;
  const tasks = summarizeTasks(sourceTasks, displayLimit);
  const hasTopLevelTasks = Array.isArray(sourceTasks) && sourceTasks.length > 0;
  const groupTaskLimit = hasTopLevelTasks ? 0 : Math.min(displayLimit, MAX_GROUP_TASKS);
  const groups = Array.isArray(result.groups) ? result.groups.map((group) => summarizeGroup(group, groupTaskLimit)) : undefined;
  const output = pickDefined({
    group: result.group,
    count: result.count,
    total: result.total,
    nextCursor: result.nextCursor,
    groups,
    tasks: tasks.items,
    hiddenTaskCount: tasks.hiddenCount || undefined,
    note: COMPACT_HINT,
  });
  return Object.keys(output).length > 1 ? output : null;
}

function compactDescribeTaskResult(result) {
  const actions = summarizeActions(result.actions, MAX_ACTIONS);
  const output = pickDefined({
    task: result.task || result.id,
    group: result.group,
    title: result.title,
    summary: result.summary,
    userPhrases: compactArray(result.userPhrases, 8).items,
    priority: result.priority,
    maxSideEffect: result.maxSideEffect,
    requiredContext: compactArray(result.requiredContext, 12).items,
    commonInputs: compactArray(result.commonInputs, 12).items,
    actionCount: result.actionCount !== undefined ? result.actionCount : actionArrayLength(result.actions),
    actions: actions.items,
    hiddenActionCount: actions.hiddenCount || undefined,
    note: COMPACT_HINT,
  });
  return output.task || output.actions ? output : null;
}

function compactSearchTasksResult(result) {
  const matches = Array.isArray(result.matches)
    ? result.matches.slice(0, MAX_TASKS).map((match) => {
      const matchedActions = summarizeActions(match.matchedActions, MAX_MATCHED_ACTIONS);
      return pickDefined({
        task: match.task || match.id,
        group: match.group,
        title: match.title,
        summary: match.summary,
        priority: match.priority,
        maxSideEffect: match.maxSideEffect,
        actionCount: match.actionCount !== undefined ? match.actionCount : actionArrayLength(match.matchedActions),
        matchedActions: matchedActions.items,
        hiddenMatchedActionCount: matchedActions.hiddenCount || undefined,
      });
    })
    : undefined;
  const output = pickDefined({
    query: result.query,
    group: result.group,
    count: result.count,
    total: result.total,
    nextCursor: result.nextCursor,
    matches,
    hiddenMatchCount: Array.isArray(result.matches) && result.matches.length > MAX_TASKS ? result.matches.length - MAX_TASKS : undefined,
    note: COMPACT_HINT,
  });
  return Object.keys(output).length > 1 ? output : null;
}

function summarizeGroup(group, maxTasks) {
  if (!group || typeof group !== "object") {
    return group;
  }
  const tasks = summarizeTasks(group.tasks, maxTasks);
  return pickDefined({
    id: group.id,
    title: group.title,
    summary: group.summary,
    taskCount: group.taskCount !== undefined ? group.taskCount : actionArrayLength(group.tasks),
    tasks: tasks.items,
    hiddenTaskCount: tasks.hiddenCount || undefined,
  });
}

function summarizeTasks(tasks, maxItems) {
  if (!Array.isArray(tasks)) {
    return { items: undefined, hiddenCount: 0 };
  }
  if (maxItems <= 0) {
    return { items: undefined, hiddenCount: tasks.length };
  }
  return {
    items: tasks.slice(0, maxItems).map(summarizeTask),
    hiddenCount: Math.max(0, tasks.length - maxItems),
  };
}

function summarizeTask(task) {
  if (!task || typeof task !== "object") {
    return task;
  }
  const actionNames = summarizeActionNames(task.actions);
  return pickDefined({
    task: task.task || task.id,
    group: task.group,
    title: task.title,
    summary: task.summary,
    priority: task.priority,
    maxSideEffect: task.maxSideEffect,
    requiredContext: compactArray(task.requiredContext, 10).items,
    commonInputs: compactArray(task.commonInputs, 10).items,
    actionCount: task.actionCount !== undefined ? task.actionCount : actionNames.total,
    actions: actionNames.items,
    hiddenActionCount: actionNames.hiddenCount || undefined,
  });
}

function summarizeActions(actions, maxItems) {
  if (!Array.isArray(actions)) {
    return { items: undefined, hiddenCount: 0 };
  }
  return {
    items: actions.slice(0, maxItems).map(summarizeAction),
    hiddenCount: Math.max(0, actions.length - maxItems),
  };
}

function summarizeAction(action) {
  if (!action || typeof action !== "object") {
    return action;
  }
  const schema = action.parameterSchema && typeof action.parameterSchema === "object" ? action.parameterSchema : {};
  return pickDefined({
    action: action.action || action.id || action.name,
    title: action.title,
    description: action.description,
    status: action.status,
    sideEffect: action.sideEffect,
    executionMode: action.executionMode,
    directExecutionSupported: action.directExecutionSupported,
    contextRequired: compactArray(action.contextRequired || schema.contextRequired, 10).items,
    payloadRequired: compactArray(action.payloadRequired || schema.payloadRequired, 10).items,
  });
}

function summarizeActionNames(actions) {
  if (!Array.isArray(actions)) {
    return { items: undefined, hiddenCount: 0, total: undefined };
  }
  const names = actions.map((action) => {
    if (typeof action === "string") {
      return action;
    }
    if (action && typeof action === "object") {
      return action.action || action.id || action.name;
    }
    return "";
  }).filter(Boolean);
  return {
    items: names.slice(0, MAX_ACTION_NAMES),
    hiddenCount: Math.max(0, names.length - MAX_ACTION_NAMES),
    total: actions.length,
  };
}

function compactArray(values, maxItems) {
  if (!Array.isArray(values)) {
    return { items: undefined, hiddenCount: 0 };
  }
  return {
    items: values.slice(0, maxItems),
    hiddenCount: Math.max(0, values.length - maxItems),
  };
}

function getDisplayLimit(args, fallback) {
  const value = Number(args && args.limit);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(value), fallback));
}

function actionArrayLength(values) {
  return Array.isArray(values) ? values.length : undefined;
}

function pickDefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function unchanged(data) {
  return {
    data,
    compacted: false,
    hint: "",
  };
}

module.exports = {
  compactMetadataCallData,
};
