'use client'

import Link from 'next/link'
import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Clock,
  Link2,
  Loader2,
  MapPin,
  MoreVertical,
  Phone,
  Search,
  Store,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  useIngredientEntries,
  useMealPlanSnapshots,
  updateIngredientEntry,
} from '@/lib/meal-planner-store'
import { StoreDialog } from '@/components/store-manager'
import { IngredientManager } from '@/components/ingredient-manager'
import { toast } from 'sonner'
import { handleError } from '@/lib/client-logger'

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

function AssociateIngredientsDialog({
  store,
  open,
  onOpenChange,
}: {
  store: GroceryStore
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const allEntries = useIngredientEntries()
  const [search, setSearch] = useState('')
  const [associating, setAssociating] = useState<Set<string>>(new Set())
  const [associated, setAssociated] = useState<Set<string>>(new Set())

  const unassigned = useMemo(
    () => allEntries.filter((e) => !e.defaultStoreId),
    [allEntries]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return unassigned
    return unassigned.filter((e) => e.name.toLowerCase().includes(q))
  }, [unassigned, search])

  const handleAssociate = async (entryId: string) => {
    const entry = allEntries.find((e) => e.id === entryId)
    if (!entry) return
    setAssociating((prev) => new Set(prev).add(entryId))
    try {
      await updateIngredientEntry({ ...entry, defaultStoreId: store.id })
      setAssociated((prev) => new Set(prev).add(entryId))
      toast.success('Ingredient associated', { description: `${entry.name} → ${store.name}` })
    } catch (err) {
      toast.error(handleError(err, 'ingredient.associate'))
    } finally {
      setAssociating((prev) => {
        const next = new Set(prev)
        next.delete(entryId)
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Associate ingredients</DialogTitle>
          <DialogDescription>
            Assign unassigned ingredients to {store.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients..."
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {unassigned.length === 0
                ? 'All ingredients are already assigned to a store.'
                : 'No ingredients match your search.'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry) => {
                const isAssociating = associating.has(entry.id)
                const isDone = associated.has(entry.id)
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                      {entry.category && (
                        <p className="text-xs text-muted-foreground">{entry.category}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isDone ? 'secondary' : 'outline'}
                      className="shrink-0 h-7 px-2.5 text-xs"
                      disabled={isAssociating || isDone}
                      onClick={() => handleAssociate(entry.id)}
                    >
                      {isAssociating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : isDone ? (
                        <>
                          <Check className="size-3.5" />
                          Associated
                        </>
                      ) : (
                        <>
                          <Link2 className="size-3.5" />
                          Associate
                        </>
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {unassigned.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {unassigned.length - associated.size} unassigned ingredient{unassigned.length - associated.size !== 1 ? 's' : ''}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StoreIdentity({ store, actions }: { store: GroceryStore; actions?: React.ReactNode }) {
  const [expandedHours, setExpandedHours] = useState(false)
  const todayHours = findTodayHours(store.hours)
  const allHours = store.hours ?? []
  const logoSrc = getStoreLogoSrc(store)

  return (
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
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground">{store.name}</h1>
          {actions}
        </div>
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
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" />
            {store.address}
          </span>
          {store.phone && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <Phone className="size-4 shrink-0" />
                {store.phone}
              </span>
            </>
          )}
          {todayHours && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">
                <Clock className="size-4 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Today:</span>{' '}
                  {todayHours}
                </span>
                {allHours.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedHours((prev) => !prev)}
                    className="text-xs text-primary hover:underline"
                  >
                    {expandedHours ? 'Show less' : 'Show more'}
                  </button>
                )}
              </span>
            </>
          )}
        </div>
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
    </div>
  )
}

export function StoreDetailsView({ storeId }: { storeId: string }) {
  const router = useRouter()
  const stores = useGroceryStores()
  const snapshots = useMealPlanSnapshots()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [associateOpen, setAssociateOpen] = useState(false)

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
      toast.error(handleError(error, 'store.delete'))
    }
  }

  if (!store) {
    return (
      <main className="min-h-screen bg-background">
        <AppHeader activeTab="stores" />
        <div className="mx-auto max-w-7xl px-5 py-7 sm:py-8">
          <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/?tab=stores" className="flex items-center gap-1 transition-colors hover:text-foreground">
              <ArrowLeft className="size-4" />
              Stores
            </Link>
          </nav>
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
      <AppHeader activeTab="stores" />

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:py-8">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/?tab=stores" className="flex items-center gap-1 transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" />
            Stores
          </Link>
        </nav>

        <StoreIdentity
          store={store}
          actions={
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
          }
        />

        <div className="space-y-3">
          <IngredientManager
            title="Ingredients"
            subtitle={null}
            showIcon={false}
            initialFilterStoreId={store.id}
            initialDefaultStoreId={store.id}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssociateOpen(true)}
          >
            <Link2 className="size-4" />
            Associate existing ingredients
          </Button>
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Previous plans</h2>
            {relatedSnapshots.length > 0 && (
              <Badge variant="secondary">{relatedSnapshots.length}</Badge>
            )}
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
        </section>

        <AssociateIngredientsDialog
          store={store}
          open={associateOpen}
          onOpenChange={setAssociateOpen}
        />

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
