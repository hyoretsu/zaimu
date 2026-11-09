import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type TimeFormat = "12h" | "24h";

export interface TimeFormatState {
	setTimeFormat: (timeFormat: TimeFormat) => void;
	timeFormat: TimeFormat;
}

export const useTimeFormatStore = create<TimeFormatState>()(
	persist(
		set => ({
			setTimeFormat: timeFormat => set({ timeFormat }),
			timeFormat: "12h",
		}),
		{
			name: "zaimu-time-format",
			storage: createJSONStorage(() => localStorage),
		},
	),
);
