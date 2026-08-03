import SwiftUI

// MARK: - Data model

struct WorkoutDay: Identifiable {
    let id: String
    let label: String
    let title: String
    let description: String
    let estimatedMinutes: Int
    let exercises: [WorkoutExercise]
}

struct WorkoutExercise: Identifiable {
    let id = UUID()
    let name: String
    let stats: String
    let difficulty: String
    let notes: String
}

// Mirror of the WORKOUT_DATA array in workout.js
let workoutSchedule: [WorkoutDay] = [
    WorkoutDay(id: "mon", label: "Mon", title: "Upper Body Push & Pull",
               description: "Upper body strength and joint stability.",
               estimatedMinutes: 45,
               exercises: [
                   WorkoutExercise(name: "Bench Press / Push-ups",
                                   stats: "3 Sets · 8–12 Reps · 90s Rest",
                                   difficulty: "Moderate",
                                   notes: "Retract shoulder blades; elbows tucked at 45°."),
                   WorkoutExercise(name: "Lat Pulldowns / Pull-ups",
                                   stats: "3 Sets · 8–10 Reps · 90s Rest",
                                   difficulty: "Moderate",
                                   notes: "Drive with elbows down smoothly to upper chest."),
               ]),
    WorkoutDay(id: "tue", label: "Tue", title: "Lower Body & Core",
               description: "Leg power with spine protection.",
               estimatedMinutes: 40,
               exercises: [
                   WorkoutExercise(name: "Goblet Squats",
                                   stats: "3 Sets · 10–12 Reps · 90s Rest",
                                   difficulty: "Moderate",
                                   notes: "Upright chest, sit between hips, knees out."),
               ]),
    WorkoutDay(id: "wed", label: "Wed", title: "Active Recovery",
               description: "Aerobic base and joint mobility work.",
               estimatedMinutes: 30,
               exercises: [
                   WorkoutExercise(name: "Zone 2 Cardio",
                                   stats: "30 Mins · HR 105–120 BPM",
                                   difficulty: "Easy",
                                   notes: "Brisk walk, light cycling, or light rowing."),
               ]),
    WorkoutDay(id: "thu", label: "Thu", title: "Upper Body Hypertrophy",
               description: "Posture strengthening and back alignment.",
               estimatedMinutes: 40,
               exercises: [
                   WorkoutExercise(name: "Single-Arm DB Rows",
                                   stats: "3 Sets · 10 Reps/side · 60s Rest",
                                   difficulty: "Moderate",
                                   notes: "Pull dumbbell to hip, keeping elbow close."),
               ]),
    WorkoutDay(id: "fri", label: "Fri", title: "Lower Body & Posterior Chain",
               description: "Glutes and hamstrings for joint support.",
               estimatedMinutes: 40,
               exercises: [
                   WorkoutExercise(name: "Bulgarian Split Squats",
                                   stats: "3 Sets · 8 Reps/leg · 90s Rest",
                                   difficulty: "Hard",
                                   notes: "Keep front foot flat; controls hip stability."),
               ]),
    WorkoutDay(id: "sat", label: "Sat", title: "Full Body Conditioning",
               description: "Endurance circuit and core strength.",
               estimatedMinutes: 35,
               exercises: [
                   WorkoutExercise(name: "Kettlebell Swings",
                                   stats: "3 Rounds · 12–15 Reps",
                                   difficulty: "Moderate",
                                   notes: "Explode from the hips; power comes from glutes."),
               ]),
    WorkoutDay(id: "sun", label: "Sun", title: "Rest & Recovery",
               description: "Full rest day for total muscle recovery.",
               estimatedMinutes: 20,
               exercises: [
                   WorkoutExercise(name: "Foam Rolling & Walk",
                                   stats: "15–20 Mins · Light Pressure",
                                   difficulty: "Easy",
                                   notes: "Focus on upper back, quads, and calves."),
               ]),
]

// MARK: - Today helper

func todayDayId() -> String {
    let weekday = Calendar.current.component(.weekday, from: Date())
    let ids = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    return ids[weekday - 1]
}

// MARK: - Views

struct ContentView: View {
    private var todayId: String { todayDayId() }

    var body: some View {
        NavigationStack {
            List(workoutSchedule) { day in
                NavigationLink(destination: DayDetailView(day: day)) {
                    HStack(spacing: 6) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(day.label)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(day.title)
                                .font(.headline)
                                .minimumScaleFactor(0.7)
                                .lineLimit(2)
                        }
                        Spacer()
                        if day.id == todayId {
                            Circle()
                                .fill(Color.accentColor)
                                .frame(width: 7, height: 7)
                        }
                    }
                }
            }
            .navigationTitle("Workout")
        }
    }
}

struct DayDetailView: View {
    let day: WorkoutDay

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(day.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("\(day.estimatedMinutes) min")
                    .font(.caption2)
                    .foregroundStyle(.accent)
                Divider()
                ForEach(day.exercises) { exercise in
                    VStack(alignment: .leading, spacing: 4) {
                        Label(exercise.name, systemImage: "figure.strengthtraining.traditional")
                            .font(.caption)
                            .fontWeight(.semibold)
                        Text(exercise.stats)
                            .font(.caption2)
                            .foregroundStyle(.accent)
                        Text(exercise.notes)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
            .padding()
        }
        .navigationTitle(day.label)
    }
}
