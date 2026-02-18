'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  MapPin,
  Phone,
  Plus,
  Store,
  X,
  MoreVertical,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  GroceryStore,
  IngredientEntry,
  MealPlanSnapshot,
  MealPlanSnapshotMeal,
} from '@/lib/types'
import {
  addIngredientEntry,
  deleteGroceryStore,
  updateIngredientEntry,
  useGroceryStores,
  useIngredientEntries,
  useMealPlanSnapshots,
} from '@/lib/meal-planner-store'
import { StoreDialog } from '@/components/store-manager'
import { toast } from 'sonner'

const CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat',
  'Pantry',
  'Bakery',
  'Spices',
  'Frozen',
  'Beverages',
  'Other',
]

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

interface RelatedSnapshot {
  snapshot: MealPlanSnapshot
  meals: MealPlanSnapshotMeal[]
}

function generateIngredientId() {
  return `ie_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function findTodayHours(hours: string[] | undefined): string | null {
  if (!hours || hours.length === 0) return null
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
    .format(new Date())
    .toLowerCase()
  const exact = hours.find((line) => line.trim().toLowerCase().startsWith(`${today}:`))
  return exact ?? hours[0] ?? null
}

function formatSnapshotMeal(meal: MealPlanSnapshotMeal): string {
  const day = DAY_LABELS[meal.day] ?? meal.day
  return `${day} · ${meal.slot} · ${meal.recipeName}`
}

function StoreIdentity({ store }: { store: GroceryStore }) {
  const [expandedHours, setExpandedHours] = useState(false)
  const todayHours = findTodayHours(store.hours)
  const allHours = store.hours ?? []

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex gap-4">
          <div className="shrink-0">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.name}
                className="size-16 rounded-lg object-cover bg-muted"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="size-16 rounded-lg bg-muted flex items-center justify-center">
                <Store className="size-7 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <h1 className="text-2xl font-bold text-foreground">{store.name}</h1>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0 mt-0.5" />
              <span>{store.address}</span>
            </div>
            {store.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="size-4 shrink-0" />
                <span>{store.phone}</span>
              </div>
            )}
            {todayHours && (
              <div className="space-y-1">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-medium text-foreground">Today&apos;s hours:</span>{' '}
                    {todayHours}
                  </span>
                </div>
                {allHours.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedHours((prev) => !prev)}
                    className="text-xs text-primary hover:underline"
                  >
                    {expandedHours ? 'Show less' : 'Show more'}
                  </button>
                )}
                {expandedHours && allHours.length > 1 && (
                  <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
                    {allHours.map((line) => (
                      <p key={line} className="text-xs text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function StoreDetailsView({ storeId }: { storeId: string }) {
  const router = useRouter()
  const stores = useGroceryStores()
  const ingredientEntries = useIngredientEntries()
  const snapshots = useMealPlanSnapshots()

  const [name, setName] = useState('')
  const [defaultUnit, setDefaultUnit] = useState('')
  const [category, setCategory] = useState('Pantry')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const store = useMemo(
    () => stores.find((candidate) => candidate.id === storeId),
    [stores, storeId]
  )

  const defaultIngredients = useMemo(
    () =>
      ingredientEntries
        .filter((entry) => entry.defaultStoreId === storeId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ingredientEntries, storeId]
  )

  const relatedSnapshots = useMemo<RelatedSnapshot[]>(() => {
    if (!store) return []
    const normalizedName = store.name.trim().toLowerCase()
    return snapshots
      .map((snapshot) => {
        const meals = snapshot.meals.filter((meal) => {
          if (meal.storeIds.includes(store.id)) return true
          return meal.storeNames.some(
            (storeName) => storeName.trim().toLowerCase() === normalizedName
          )
        })
        if (meals.length === 0) return null
        return { snapshot, meals }
      })
      .filter((value): value is RelatedSnapshot => value !== null)
  }, [snapshots, store])

  const handleAddIngredient = async () => {
    if (!store || !name.trim()) return
    const now = new Date().toISOString()
    const entry: IngredientEntry = {
      id: generateIngredientId(),
      name: name.trim().toLowerCase(),
      defaultUnit: defaultUnit.trim(),
      defaultStoreId: store.id,
      category,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await addIngredientEntry(entry)
      setName('')
      setDefaultUnit('')
      setCategory('Pantry')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to add ingredient.'
      toast.error(message)
    }
  }

  const handleRemoveIngredientFromStore = async (entry: IngredientEntry) => {
    try {
      await updateIngredientEntry({
        ...entry,
        defaultStoreId: '',
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to unassign ingredient from store.'
      toast.error(message)
    }
  }

  const handleDeleteStore = async () => {
    if (!store) return
    try {
      await deleteGroceryStore(store.id)
      toast.success('Store removed', { description: store.name })
      router.push('/?tab=stores')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to delete store.'
      toast.error(message)
    }
  }

  if (!store) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/?tab=stores">
              <ArrowLeft className="size-4" />
              Back to Stores
            </Link>
          </Button>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Store not found.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost">
            <Link href="/?tab=stores">
              <ArrowLeft className="size-4" />
              Back to Stores
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Store actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <StoreIdentity store={store} />

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Default Ingredients
                </h2>
                <p className="text-sm text-muted-foreground">
                  Ingredients assigned to this store by default.
                </p>
              </div>
              <Badge variant="secondary">{defaultIngredients.length}</Badge>
            </div>

            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="store-ing-name">Name</Label>
                <Input
                  id="store-ing-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. baby spinach"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="store-ing-unit">Default unit</Label>
                <Input
                  id="store-ing-unit"
                  value={defaultUnit}
                  onChange={(event) => setDefaultUnit(event.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="store-ing-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="store-ing-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddIngredient} disabled={!name.trim()}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </div>

            {defaultIngredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ingredients are currently assigned to this store.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {defaultIngredients.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {entry.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.category}
                        {entry.defaultUnit ? ` · ${entry.defaultUnit}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveIngredientFromStore(entry)}
                    >
                      <X className="size-4" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Previous Meal Plans
                </h2>
                <p className="text-sm text-muted-foreground">
                  Meals from saved snapshots that reference this store.
                </p>
              </div>
              <Badge variant="secondary">{relatedSnapshots.length}</Badge>
            </div>

            {relatedSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved snapshots reference this store yet.
              </p>
            ) : (
              <div className="space-y-3">
                {relatedSnapshots.map(({ snapshot, meals }) => (
                  <div
                    key={snapshot.id}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {snapshot.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(snapshot.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {meals.map((meal) => (
                        <p key={`${snapshot.id}-${meal.day}-${meal.slot}-${meal.recipeId}`} className="text-xs text-muted-foreground">
                          {formatSnapshotMeal(meal)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <StoreDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          editingStore={store}
        />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {store.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the store from your list. Ingredients assigned
                to this store will be unassigned.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteStore}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
