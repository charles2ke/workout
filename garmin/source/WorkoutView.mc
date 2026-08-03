import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Mirror of WORKOUT_DATA in workout.js
// Each entry: [dayLabel, title, duration, primaryExercise]
const WORKOUT_DAYS as Lang.Array<Lang.Array<Lang.String>> = [
    ["Mon", "Upper Body\nPush & Pull", "45 min", "Bench Press / Push-ups"],
    ["Tue", "Lower Body\n& Core",      "40 min", "Goblet Squats"],
    ["Wed", "Active\nRecovery",         "30 min", "Zone 2 Cardio"],
    ["Thu", "Upper Body\nHypertrophy",  "40 min", "Single-Arm DB Rows"],
    ["Fri", "Lower Body &\nPost. Chain","40 min", "Bulgarian Split Squats"],
    ["Sat", "Full Body\nConditioning",  "35 min", "Kettlebell Swings"],
    ["Sun", "Rest &\nRecovery",          "20 min", "Foam Rolling & Walk"],
];

class WorkoutView extends WatchUi.View {

    var mDayIndex as Lang.Number;

    function initialize() {
        View.initialize();
        // Gregorian weekday: 1=Sun, 2=Mon, …, 7=Sat  →  array index Mon=0…Sun=6
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        mDayIndex = (info.day_of_week + 5) % 7;
    }

    function onLayout(dc as Graphics.Dc) as Void {
    }

    function onShow() as Void {
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;

        // Background
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var day = WORKOUT_DAYS[mDayIndex];

        // App header
        dc.setColor(0x00BFFF, Graphics.COLOR_TRANSPARENT); // sky blue
        dc.drawText(cx, 10, Graphics.FONT_TINY, "WORKOUT", Graphics.TEXT_JUSTIFY_CENTER);

        // Day label
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 46, Graphics.FONT_SMALL, day[0], Graphics.TEXT_JUSTIFY_CENTER);

        // Workout title (may be two lines)
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 - 26, Graphics.FONT_TINY, day[1], Graphics.TEXT_JUSTIFY_CENTER);

        // Duration
        dc.setColor(0x00BFFF, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 + 14, Graphics.FONT_TINY, day[2], Graphics.TEXT_JUSTIFY_CENTER);

        // Primary exercise
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h / 2 + 32, Graphics.FONT_XTINY, day[3], Graphics.TEXT_JUSTIFY_CENTER);

        // Swipe navigation hint
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h - 22, Graphics.FONT_XTINY, "◀ swipe ▶", Graphics.TEXT_JUSTIFY_CENTER);
    }

    function onHide() as Void {
    }

    function nextDay() as Void {
        mDayIndex = (mDayIndex + 1) % 7;
        WatchUi.requestUpdate();
    }

    function prevDay() as Void {
        mDayIndex = (mDayIndex + 6) % 7;
        WatchUi.requestUpdate();
    }
}

class WorkoutDelegate extends WatchUi.SwipeDelegate {

    var mView as WorkoutView;

    function initialize(view as WorkoutView) {
        SwipeDelegate.initialize();
        mView = view;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Lang.Boolean {
        if (swipeEvent.getDirection() == WatchUi.SWIPE_LEFT) {
            mView.nextDay();
        } else if (swipeEvent.getDirection() == WatchUi.SWIPE_RIGHT) {
            mView.prevDay();
        }
        return true;
    }
}
