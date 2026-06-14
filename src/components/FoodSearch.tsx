"use client";

import type { Food } from "@/lib/foods";

const EMOJI: Record<string, string> = {
  protein:   "🍗",
  carbs:     "🍚",
  vegetable: "🥦",
  fruit:     "🍎",
  dairy:     "🥛",
  nuts:      "🥜",
  fats:      "🥑",
};

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  foods: Food[];
  onAdd: (id: number) => void;
  loading: boolean;
}

export default function FoodSearch({ search, onSearchChange, foods, onAdd, loading }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 shrink-0">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Add Food</h2>
        <input
          type="text"
          placeholder="Search 25 foods…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder-gray-400"
        />
        {search && (
          <p className="text-xs text-gray-400 mt-1">{foods.length} result{foods.length !== 1 ? "s" : ""}</p>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {foods.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No foods match "{search}"</div>
        ) : (
          foods.map((food) => (
            <button
              key={food.id}
              onClick={() => !loading && onAdd(food.id)}
              disabled={loading}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 active:bg-emerald-100 transition-colors border-b border-gray-50 last:border-0 disabled:opacity-50 text-left group"
            >
              <span className="text-lg shrink-0">{EMOJI[food.category] ?? "🍽️"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-emerald-700">
                  {food.name}
                </p>
                <p className="text-xs text-gray-400 truncate">{food.serving}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-emerald-600">{food.calories}</p>
                <p className="text-xs text-gray-400">kcal</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
