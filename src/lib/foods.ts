export interface Food {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving: string;
  category: string;
}

export const FOODS: Food[] = [
  { id: 1,  name: "Chicken Breast",    calories: 165, protein: 31,  carbs: 0,   fat: 3.6, serving: "100g",              category: "protein"    },
  { id: 2,  name: "White Rice",        calories: 130, protein: 2.7, carbs: 28,  fat: 0.3, serving: "100g cooked",       category: "carbs"      },
  { id: 3,  name: "Egg",               calories: 72,  protein: 6,   carbs: 0.4, fat: 5,   serving: "1 large",           category: "protein"    },
  { id: 4,  name: "Banana",            calories: 89,  protein: 1.1, carbs: 23,  fat: 0.3, serving: "1 medium",          category: "fruit"      },
  { id: 5,  name: "Oatmeal",           calories: 154, protein: 5.5, carbs: 27,  fat: 2.6, serving: "100g cooked",       category: "carbs"      },
  { id: 6,  name: "Salmon",            calories: 208, protein: 20,  carbs: 0,   fat: 13,  serving: "100g",              category: "protein"    },
  { id: 7,  name: "Broccoli",          calories: 34,  protein: 2.8, carbs: 7,   fat: 0.4, serving: "100g",              category: "vegetable"  },
  { id: 8,  name: "Sweet Potato",      calories: 86,  protein: 1.6, carbs: 20,  fat: 0.1, serving: "100g",              category: "carbs"      },
  { id: 9,  name: "Greek Yogurt",      calories: 59,  protein: 10,  carbs: 3.6, fat: 0.4, serving: "100g",              category: "dairy"      },
  { id: 10, name: "Almonds",           calories: 164, protein: 6,   carbs: 6,   fat: 14,  serving: "28g / 1 oz",        category: "nuts"       },
  { id: 11, name: "Ground Beef",       calories: 254, protein: 17,  carbs: 0,   fat: 20,  serving: "100g",              category: "protein"    },
  { id: 12, name: "Milk",              calories: 149, protein: 8,   carbs: 12,  fat: 8,   serving: "240ml / 1 cup",     category: "dairy"      },
  { id: 13, name: "Whole Wheat Bread", calories: 79,  protein: 2.7, carbs: 15,  fat: 1,   serving: "1 slice",           category: "carbs"      },
  { id: 14, name: "Apple",             calories: 95,  protein: 0.5, carbs: 25,  fat: 0.3, serving: "1 medium",          category: "fruit"      },
  { id: 15, name: "Pasta",             calories: 131, protein: 5,   carbs: 25,  fat: 1.1, serving: "100g cooked",       category: "carbs"      },
  { id: 16, name: "Tuna (canned)",     calories: 116, protein: 26,  carbs: 0,   fat: 1,   serving: "100g",              category: "protein"    },
  { id: 17, name: "Peanut Butter",     calories: 188, protein: 8,   carbs: 6,   fat: 16,  serving: "2 tbsp",            category: "nuts"       },
  { id: 18, name: "Orange",            calories: 62,  protein: 1.2, carbs: 15,  fat: 0.2, serving: "1 medium",          category: "fruit"      },
  { id: 19, name: "Cottage Cheese",    calories: 98,  protein: 11,  carbs: 3.4, fat: 4.3, serving: "100g",              category: "dairy"      },
  { id: 20, name: "Protein Shake",     calories: 120, protein: 25,  carbs: 3,   fat: 2,   serving: "1 scoop",           category: "protein"    },
  { id: 21, name: "Quinoa",            calories: 120, protein: 4.4, carbs: 22,  fat: 1.9, serving: "100g cooked",       category: "carbs"      },
  { id: 22, name: "Avocado",           calories: 120, protein: 1.5, carbs: 6,   fat: 11,  serving: "1/2 medium",        category: "fats"       },
  { id: 23, name: "Strawberries",      calories: 32,  protein: 0.7, carbs: 8,   fat: 0.3, serving: "100g",              category: "fruit"      },
  { id: 24, name: "Lentils",           calories: 116, protein: 9,   carbs: 20,  fat: 0.4, serving: "100g cooked",       category: "carbs"      },
  { id: 25, name: "Tofu",              calories: 76,  protein: 8,   carbs: 2,   fat: 4.5, serving: "100g",              category: "protein"    },
];
