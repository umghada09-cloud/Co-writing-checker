/**
 * Grade 12 Study Planner · منظّم المذاكرة — Google Apps Script web app.
 *
 * Files in this project:
 *   Code.gs     (this file)
 *   Index.html  (the planner page, pasted unchanged)
 *
 * Each student's name, subjects and ticks are saved in their own browser,
 * so many students can use the same link without seeing each other's progress.
 */
function doGet() {
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent();

  // Small safety shim: Google's page frame can block history changes.
  var shim = '<script>(function(){var r=history.replaceState;' +
    'history.replaceState=function(){try{return r.apply(history,arguments);}catch(e){}};})();</script>';
  html = html.replace('<script id="app">', shim + '<script id="app">');

  return HtmlService.createHtmlOutput(html)
    .setTitle('Grade 12 Study Planner · منظّم المذاكرة')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
