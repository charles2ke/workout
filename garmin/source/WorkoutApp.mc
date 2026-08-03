import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class WorkoutApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Lang.Dictionary?) as Void {
    }

    function onStop(state as Lang.Dictionary?) as Void {
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new WorkoutView();
        var delegate = new WorkoutDelegate(view);
        return [view, delegate];
    }
}

function getApp() as WorkoutApp {
    return Application.getApp() as WorkoutApp;
}
