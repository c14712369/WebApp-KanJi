/** 線上部署的版本與執行中的不同才算有更新；任一邊未知或本機開發（dev）都不提示 */
export function hasNewerVersion(current, latest) {
  if (!current || !latest || current === 'dev') return false;
  return current !== latest;
}
