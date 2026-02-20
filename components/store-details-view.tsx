'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  MapPin,
  MoreVertical,
  Phone,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import type { GroceryStore } from '@/lib/types'
import {
  deleteGroceryStore,
  useGroceryStores,
  useMealPlanSnapshots,
} from '@/lib/meal-planner-store'
import { StoreDialog } from '@/components/store-manager'
import { IngredientManager } from '@/components/ingredient-manager'
import { toast } from 'sonner'

function findTodayHours(hours: string[] | undefined): string | null {
  if (!hours || hours.length === 0) return null
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
    .format(new Date())
    .toLowerCase()
  const exact = hours.find((line) => line.trim().toLowerCase().startsWith(`${today}:`))
  return exact ?? hours[0] ?? null
}

function getStoreLogoSrc(store: GroceryStore): string | undefined {
  if (store.logoUrl && store.logoUrl.trim().length > 0) return store.logoUrl
  if (store.placeId && store.placeId.trim().length > 0) {
    return `/api/places/photo?placeId=${encodeURIComponent(store.placeId)}&maxHeightPx=200&maxWidthPx=200`
  }
  return undefined
}

function StoreIdentity({ store }: { store: GroceryStore }) {
  const [expandedHours, setExpandedHours] = useState(false)
  const todayHours = findTodayHours(store.hours)
  const allHours = store.hours ?? []
  const logoSrc = getStoreLogoSrc(store)

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex gap-4">
          <div className="shrink-0">
            {logoSrc ? (
              <img
                src={logoSrc}
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
            {store.supportsOnlineOrdering ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-5 text-[11px]">
                  Online ordering enabled
                </Badge>
                {store.onlineOrderingProvider ? (
                  <Badge variant="outline" className="h-5 text-[11px]">
                    Provider: {store.onlineOrderingProvider}
                  </Badge>
                ) : null}
                {store.onlineOrderingProvider === 'target' &&
                store.onlineOrderingConfig?.targetStoreId ? (
                  <Badge variant="outline" className="h-5 text-[11px]">
                    Target ID: {store.onlineOrderingConfig.targetStoreId}
                  </Badge>
                ) : null}
              </div>
            ) : null}
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
  const snapshots = useMealPlanSnapshots()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const store = useMemo(
    () => stores.find((candidate) => candidate.id === storeId),
    [stores, storeId]
  )

  const relatedSnapshots = useMemo(() => {
    if (!store) return []

    const normalizedName = store.name.trim().toLowerCase()

    return snapshots
      .filter((snapshot) =>
        snapshot.meals.some((meal) => {
          if (meal.storeIds.includes(store.id)) return true
          return meal.storeNames.some(
            (storeName) => storeName.trim().toLowerCase() === normalizedName
          )
        })
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
  }, [snapshots, store])

  const handleDeleteStore = async () => {
    if (!store) return
    try {
      await deleteGroceryStore(store.id)
      toast.success('Store removed', { description: store.name })
      router.push('/?tab=stores')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete store.'
      toast.error(message)
    }
  }

  if (!store) {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <UtensilsCrossed className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-foreground">Meal Planner</h1>
              <p className="text-xs text-muted-foreground">Stores</p>
            </div>
          </div>
        </header>
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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-foreground">Meal Planner</h1>
            <p className="text-xs text-muted-foreground">Stores</p>
          </div>
        </div>
      </header>

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
              <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>Edit</DropdownMenuItem>
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

        <IngredientManager
          title="Ingredients"
          subtitle={null}
          showIcon={false}
          initialFilterStoreId={store.id}
        />

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Previous Meal Plans</h2>
              <Badge variant="secondary">{relatedSnapshots.length}</Badge>
            </div>

            {relatedSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No previous meal plans reference this store.
              </p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Plan Name</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                        <th className="px-3 py-2 text-left font-medium">Meals</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {relatedSnapshots.map((snapshot) => (
                        <tr key={snapshot.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 align-middle">
                            <Link
                              href={`/plans/${encodeURIComponent(snapshot.id)}`}
                              className="font-medium text-foreground hover:underline underline-offset-2"
                            >
                              {snapshot.label}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 align-middle text-muted-foreground">
                            {snapshot.description.trim() || '—'}
                          </td>
                          <td className="px-3 py-2.5 align-middle text-muted-foreground">
                            {snapshot.meals.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <AlertDialogAction onClick={handleDeleteStore}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  )
}
