'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  MapPin,
  Phone,
  Clock,
  Pencil,
  Trash2,
  Plus,
  Search,
  Loader2,
  Store,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { GroceryStore } from '@/lib/types'
import {
  useGroceryStores,
  addGroceryStore,
  updateGroceryStore,
  deleteGroceryStore,
} from '@/lib/meal-planner-store'

function generateId() {
  return `store_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ---- Place search result type ----
interface PlaceResult {
  placeId: string
  name: string
  address: string
  lat?: number
  lng?: number
  phone?: string
  hours?: string[]
  photoUrl?: string
}

// ---- Add/Edit Store Dialog ----
function StoreDialog({
  open,
  onOpenChange,
  editingStore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingStore: GroceryStore | null
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null)

  // Manual form fields
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [hours, setHours] = useState<string[]>([])
  const [logoUrl, setLogoUrl] = useState('')
  const [placeId, setPlaceId] = useState<string | undefined>()
  const [lat, setLat] = useState<number | undefined>()
  const [lng, setLng] = useState<number | undefined>()

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingStore) {
        setName(editingStore.name)
        setAddress(editingStore.address)
        setPhone(editingStore.phone ?? '')
        setHours(editingStore.hours ?? [])
        setLogoUrl(editingStore.logoUrl ?? '')
        setPlaceId(editingStore.placeId)
        setLat(editingStore.lat)
        setLng(editingStore.lng)
        setQuery('')
        setResults([])
        setSelectedPlace(null)
      } else {
        setName('')
        setAddress('')
        setPhone('')
        setHours([])
        setLogoUrl('')
        setPlaceId(undefined)
        setLat(undefined)
        setLng(undefined)
        setQuery('')
        setResults([])
        setSelectedPlace(null)
      }
      setSearchError(null)
    }
  }, [open, editingStore])

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setQuery(value)
    setSearchError(null)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (value.trim().length < 3) {
      setResults([])
      return
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch('/api/places/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value }),
        })
        const data = await res.json()
        if (!res.ok) {
          setSearchError(data.error ?? 'Search failed')
          setResults([])
        } else {
          setResults(data.results ?? [])
          if ((data.results ?? []).length === 0) {
            setSearchError('No results found. Try a different search term.')
          }
        }
      } catch {
        setSearchError('Network error. Check your connection.')
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [])

  const selectPlace = useCallback((place: PlaceResult) => {
    setSelectedPlace(place)
    setName(place.name)
    setAddress(place.address)
    setPhone(place.phone ?? '')
    setHours(place.hours ?? [])
    setLogoUrl(place.photoUrl ?? '')
    setPlaceId(place.placeId)
    setLat(place.lat)
    setLng(place.lng)
    setResults([])
    setQuery('')
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      toast.error('Store name is required')
      return
    }
    if (!address.trim()) {
      toast.error('Store address is required')
      return
    }

    const now = new Date().toISOString()
    const storeData: GroceryStore = {
      id: editingStore?.id ?? generateId(),
      name: name.trim(),
      address: address.trim(),
      placeId,
      lat,
      lng,
      phone: phone.trim() || undefined,
      hours: hours.length > 0 ? hours : undefined,
      logoUrl: logoUrl.trim() || undefined,
      createdAt: editingStore?.createdAt ?? now,
      updatedAt: now,
    }

    if (editingStore) {
      updateGroceryStore(storeData)
      toast.success('Store updated', { description: storeData.name })
    } else {
      addGroceryStore(storeData)
      toast.success('Store added', { description: storeData.name })
    }
    onOpenChange(false)
  }, [name, address, phone, hours, logoUrl, placeId, lat, lng, editingStore, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingStore ? 'Edit Store' : 'Add New Store'}
          </DialogTitle>
          <DialogDescription>
            {editingStore
              ? 'Update the store details below.'
              : 'Search by address to auto-fill store details, or enter them manually.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Address search */}
          {!editingStore && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="store-search">Search by address or store name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="store-search"
                  value={query}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="e.g. Trader Joe's on Market St, SF"
                  className="pl-10"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
                )}
              </div>

              {/* Search results */}
              {results.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden max-h-60 overflow-y-auto">
                  {results.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      onClick={() => selectPlace(place)}
                      className="flex items-start gap-3 w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-b-0"
                    >
                      {place.photoUrl ? (
                        <img
                          src={place.photoUrl}
                          alt=""
                          className="size-10 rounded-md object-cover shrink-0 bg-muted"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Store className="size-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {place.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {place.address}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchError && (
                <p className="text-xs text-muted-foreground">{searchError}</p>
              )}

              {selectedPlace && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2">
                  <Store className="size-4 text-foreground shrink-0" />
                  <div className="flex flex-col gap-0 flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">
                      {selectedPlace.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {selectedPlace.address}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlace(null)
                      setName('')
                      setAddress('')
                      setPhone('')
                      setHours([])
                      setLogoUrl('')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Manual form fields */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-name">Store name</Label>
              <Input
                id="store-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Whole Foods Market"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-address">Address</Label>
              <Input
                id="store-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 399 4th St, San Francisco, CA"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="store-phone">Phone (optional)</Label>
              <Input
                id="store-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. (415) 618-0066"
              />
            </div>

            {hours.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Hours</Label>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-col gap-1">
                    {hours.map((h, i) => (
                      <span key={i} className="text-xs text-muted-foreground">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {editingStore ? 'Save Changes' : 'Add Store'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---- Store Card ----
function StoreCard({
  store,
  onEdit,
  onDelete,
}: {
  store: GroceryStore
  onEdit: (store: GroceryStore) => void
  onDelete: (id: string) => void
}) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          {/* Logo / placeholder */}
          <div className="shrink-0">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.name}
                className="size-14 rounded-lg object-cover bg-muted"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="size-14 rounded-lg bg-muted flex items-center justify-center">
                <Store className="size-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {store.name}
            </h3>
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{store.address}</span>
            </div>
            {store.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="size-3.5 shrink-0" />
                <span>{store.phone}</span>
              </div>
            )}
            {store.hours && store.hours.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-1">{store.hours[0]}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEdit(store)}
              aria-label={`Edit ${store.name}`}
            >
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${store.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {store.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the store from your list. Existing recipe
                    ingredients referencing this store will keep their store name
                    but lose the link.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(store.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Main Store Manager ----
export function StoreManager() {
  const stores = useGroceryStores()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<GroceryStore | null>(null)
  const [search, setSearch] = useState('')

  const handleAdd = useCallback(() => {
    setEditingStore(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((store: GroceryStore) => {
    setEditingStore(store)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback((id: string) => {
    const store = stores.find((s) => s.id === id)
    deleteGroceryStore(id)
    toast.success('Store removed', { description: store?.name })
  }, [stores])

  const filtered = search.trim()
    ? stores.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.address.toLowerCase().includes(search.toLowerCase())
      )
    : stores

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Store className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">
              Stores
            </h2>
            <p className="text-xs text-muted-foreground">
              {stores.length} store{stores.length !== 1 ? 's' : ''} saved
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="size-4" />
          Add Store
        </Button>
      </div>

      {/* Search */}
      {stores.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores..."
            className="pl-10"
          />
        </div>
      )}

      {/* Store cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Store className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {search ? 'No stores match your search' : 'No stores yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search
                ? 'Try a different search term.'
                : 'Add a store to get started. Search by address to auto-fill details.'}
            </p>
          </div>
          {!search && (
            <Button size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="size-4" />
              Add your first store
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <StoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingStore={editingStore}
      />
    </div>
  )
}
