import { Text, TouchableOpacity, View } from "react-native";

type ChoiceValue = boolean | null;

type Question = {
  label: string;
  value: ChoiceValue;
  onChange: (value: ChoiceValue) => void;
};

type Props = {
  hasVehicle: boolean | null;
  hasSchoolAgeChildren: boolean | null;
  onVehicleChange: (value: boolean | null) => void;
  onChildrenChange: (value: boolean | null) => void;
};

const CHOICES: { label: string; value: ChoiceValue }[] = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "Skip for now", value: null },
];

export function MovePreferences({
  hasVehicle,
  hasSchoolAgeChildren,
  onVehicleChange,
  onChildrenChange,
}: Props) {
  const questions: Question[] = [
    {
      label:
        "Are you bringing a vehicle to register in your destination province or territory?",
      value: hasVehicle,
      onChange: onVehicleChange,
    },
    {
      label: "Are school-age children moving with you?",
      value: hasSchoolAgeChildren,
      onChange: onChildrenChange,
    },
  ];

  return (
    <View className="mb-5">
      <Text className="mb-2 text-base font-semibold text-slate-900">
        Tailor your checklist (optional)
      </Text>
      <Text className="mb-4 text-sm text-slate-500">
        Answers stay on this device. Skip to keep conditional tasks visible.
      </Text>

      {questions.map((question) => (
        <View key={question.label} className="mb-4">
          <Text className="mb-2 text-sm font-medium text-slate-700">
            {question.label}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CHOICES.map((choice) => {
              const selected = question.value === choice.value;
              return (
                <TouchableOpacity
                  key={choice.label}
                  onPress={() => question.onChange(choice.value)}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityLabel={`${question.label} ${choice.label}`}
                  accessibilityState={{ selected }}
                  className={`min-h-12 justify-center rounded-xl border px-4 py-3 ${
                    selected
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <Text
                    className={
                      selected
                        ? "font-semibold text-blue-700"
                        : "text-slate-700"
                    }
                  >
                    {choice.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
