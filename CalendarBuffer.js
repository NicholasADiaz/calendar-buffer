/**
 * Reference: Google Calendar Color IDs
 *  1 = Lavender,
 *  2 = Sage, 
 *  3 = Grape, 
 *  4 = Flamingo, 
 *  5 = Banana,
 *  6 = Tangerine, 
 *  7 = Peacock, 
 *  8 = Graphite, 
 *  9 = Blueberry,
 *  10 = Basil,   
 *  11 = Tomato
 */
var PRE_MEETING_COLOR_ID  = "11";  // Tomato
var POST_MEETING_COLOR_ID = "3";   // Grape

// Only these organizers trigger buffers:
var ALLOWED_ORGANIZERS = [
  "firstname.lastname@gmail.com.com",
  "firstname.lastname2@gmail.com",
  "nicholasadiaz1@gmail.com"
];

/**
 * Runs every minute. Scans events from 1h ago to 90d in future.
 * Creates only missing buffers, and cleans up orphans.
 */
function frequentCheck() {
  var props    = PropertiesService.getScriptProperties();
  var cal      = CalendarApp.getDefaultCalendar();
  var now      = new Date();
  var backtrack= new Date(now.getTime() - 60*60000);          // 1h ago
  var cutoff   = new Date(now.getTime() + 90*24*60*60000);    // 90d ahead
  var allEvts  = cal.getEvents(backtrack, cutoff);

  var mainTitles = new Set();
  for (var i = 0; i < allEvts.length; i++) {
    var ev    = allEvts[i];
    var title = ev.getTitle();

    // skip buffers themselves
    if (title.startsWith("Pre-Meeting: ") || title.startsWith("Post-Meeting: ")) {
      continue;
    }
    mainTitles.add(title);

    // only meetings ≥40min
    var start = ev.getStartTime(),
        end   = ev.getEndTime(),
        dur   = (end - start) / (1000*60);
    if (dur < 40) continue;

    // only allowed creators
    var creator = ev.getCreators()[0];
    if (ALLOWED_ORGANIZERS.indexOf(creator) < 0) continue;

    var id       = ev.getId();
    if (props.getProperty("deleted_" + id) === "true") continue;

    var stamp    = start.getTime() + "|" + end.getTime();
    var stored   = props.getProperty("startEnd_" + id);

    // check exactly which buffers already exist
    var hasBuf = hasPrePostBuffers(ev);

    if (!stored) {
      // first time seeing this event
      if (!hasBuf.pre)  createPreBuffer(ev);
      if (!hasBuf.post) createPostBuffer(ev);
      props.setProperty("startEnd_" + id, stamp);

    } else if (stored !== stamp) {
      // event time changed → rebuild both
      removeOldBuffers(title, backtrack, cutoff);
      createPreBuffer(ev);
      createPostBuffer(ev);
      props.setProperty("startEnd_" + id, stamp);

    } else if (!hasBuf.pre || !hasBuf.post) {
      // one of the buffers got deleted manually → recreate only that one
      if (!hasBuf.pre) {
        removeOldBuffers(title, backtrack, cutoff, "pre");
        createPreBuffer(ev);
      }
      if (!hasBuf.post) {
        removeOldBuffers(title, backtrack, cutoff, "post");
        createPostBuffer(ev);
      }
      props.setProperty("startEnd_" + id, stamp);
    }
  }

  // wipe out any leftover buffers whose main event no longer exists
  cleanUpOrphanBuffers(mainTitles, backtrack, cutoff);
}


/**
 * Returns {pre: boolean, post: boolean} by looking only
 * in the exact pre / post window around ev.
 */
function hasPrePostBuffers(ev) {
  var cal       = CalendarApp.getDefaultCalendar();
  var now       = new Date();
  var backtrack = new Date(now.getTime() - 60*60000);
  var cutoff    = new Date(now.getTime() + 90*24*60*60000);
  var allEvts   = cal.getEvents(backtrack, cutoff);
  var title     = ev.getTitle();
  var preTitle  = "Pre-Meeting: "  + title;
  var postTitle = "Post-Meeting: " + title;
  return {
    pre:  allEvts.some(e => e.getTitle() === preTitle),
    post: allEvts.some(e => e.getTitle() === postTitle)
  };
}


/**
 * Deletes old buffer(s) of type "pre", "post", or both if
 * type is omitted.
 */
function removeOldBuffers(mainTitle, startWindow, endWindow, type) {
  var cal = CalendarApp.getDefaultCalendar();
  var evs = cal.getEvents(startWindow, endWindow);
  var preT  = "Pre-Meeting: "  + mainTitle;
  var postT = "Post-Meeting: " + mainTitle;

  for (var i = 0; i < evs.length; i++) {
    var t = evs[i].getTitle();
    if (!type && (t === preT || t === postT)) {
      evs[i].deleteEvent();
    }
    else if (type === "pre"  && t === preT)  evs[i].deleteEvent();
    else if (type === "post" && t === postT) evs[i].deleteEvent();
  }
}

/**
 * Creates just the pre‑meeting buffer if none exists.
 */
function createPreBuffer(ev) {
  var cal      = CalendarApp.getDefaultCalendar();
  var title    = ev.getTitle();
  var preStart = new Date(ev.getStartTime().getTime() - 60*60000);
  var preEvts  = cal.getEvents(preStart, ev.getStartTime());
  var preTitle = "Pre-Meeting: " + title;

  // skip if already there
  if (preEvts.some(e => e.getTitle() === preTitle)) return;

  var pre = cal.createEvent(preTitle,
                            preStart,
                            ev.getStartTime(),
                            {description: "Preparation time for " + title});
  if (PRE_MEETING_COLOR_ID) pre.setColor(PRE_MEETING_COLOR_ID);
}

/**
 * Creates just the post‑meeting buffer if none exists.
 */
function createPostBuffer(ev) {
  var cal       = CalendarApp.getDefaultCalendar();
  var title     = ev.getTitle();
  var postEnd   = new Date(ev.getEndTime().getTime() + 30*60000);
  var postEvts  = cal.getEvents(ev.getEndTime(), postEnd);
  var postTitle = "Post-Meeting: " + title;

  if (postEvts.some(e => e.getTitle() === postTitle)) return;

  var post = cal.createEvent(postTitle,
                             ev.getEndTime(),
                             postEnd,
                             {description: "Wrap‑up time for " + title});
  if (POST_MEETING_COLOR_ID) post.setColor(POST_MEETING_COLOR_ID);
}

/**
 * Cleans up any pre/post buffer whose mainTitle is no longer in the set.
 */
function cleanUpOrphanBuffers(validMainTitles, startWindow, endWindow) {
  var cal   = CalendarApp.getDefaultCalendar();
  var now   = new Date();
  var evs   = cal.getEvents(startWindow, endWindow);

  evs.forEach(function(ev) {
    var t = ev.getTitle();
    if (!t.startsWith("Pre-Meeting: ") && !t.startsWith("Post-Meeting: ")) return;

    var main = t.replace("Pre-Meeting: ","")
                .replace("Post-Meeting: ","");

    //  ➤ if it’s a post‑buffer that’s already over, just leave it alone
    if (t.startsWith("Post-Meeting: ") && ev.getEndTime() <= now) {
      return;
    }

    if (!validMainTitles.has(main)) {
      ev.deleteEvent();
    }
  });
}

/**
 * (Re)sets up the every‑minute trigger.
 */
function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("frequentCheck")
    .timeBased().everyMinutes(1).create();
  Logger.log("Trigger reset.");
}

/**
 * Wipes all script props (use sparingly!).
 */
function clearAllProps() {
  PropertiesService.getScriptProperties().deleteAllProperties();
}

/**
 * Quick helper to clear every buffer in the next 90 days.
 * Handy for testing.
 */
function clearAllBuffers() {
  var cal = CalendarApp.getDefaultCalendar();
  var now = new Date();
  var future = new Date(now.getTime() + 90*24*60*60000);
  cal.getEvents(now, future)
     .filter(e => e.getTitle().startsWith("Pre-Meeting: ") ||
                  e.getTitle().startsWith("Post-Meeting: "))
     .forEach(e => e.deleteEvent());
}
