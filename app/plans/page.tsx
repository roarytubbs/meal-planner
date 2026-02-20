'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  activateMealPlanSnapshot,
  deleteMealPlanSnapshot,
  useMealPlanSnapshots,
  useStoreStatus,
} from '@/lib/meal-planner-store'
import type { MealPlanSnapshot } from '@/lib/types'

function formatCreatedAt(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

export default function MealPlansPage() {
  const { loading, error } = useStoreStatus()
  const snapshots = useMealPlanSnapshots()

  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MealPlanSnapshot | null>(null)

  const sortedSnapshots = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [snapshots]
  )
  const handleActivate = useCallback(async (snapshot: MealPlanSnapshot) => {
    const actionKey = `activate-${snapshot.id}`
    setPendingAction(actionKey)
    try {
      await activateMealPlanSnapshot(snapshot.id)
      toast.success('Current plan updated', { description: snapshot.label })
    } catch (activateError) {
      const message =
        activateError instanceof Error
          ? activateError.message
          : 'Unable to set current meal plan.'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return

    const actionKey = `delete-${deleteTarget.id}`
    setPendingAction(actionKey)
    try {
      await deleteMealPlanSnapshot(deleteTarget.id)
      toast.success('Meal plan deleted', { description: deleteTarget.label })
      setDeleteTarget(null)
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : 'Unable to delete meal plan.'
      toast.error(message)
    } finally {
      setPendingAction(null)
    }
  }, [deleteTarget])

  return (
    <main className="min-h-screen bg-background">
      <AppHeader activeTab="planner" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-7 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Meal Plans</h1>
            <p className="text-sm text-muted-foreground">
              Browse saved plans, set the current one, and open a plan in planner mode.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/?tab=planner">
                <Plus className="size-4" />
                New Plan
              </Link>
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {loading && sortedSnapshots.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Loading meal plans...
            </CardContent>
          </Card>
        ) : null}

        {!loading && sortedSnapshots.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No meal plans yet</CardTitle>
              <CardDescription>
                Save a plan from the planner to start managing plan history.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardContent className="px-0 pb-0">
              <div className="divide-y divide-border">
                {sortedSnapshots.map((snapshot) => {
                  const activating = pendingAction === `activate-${snapshot.id}`
                  const deleting = pendingAction === `delete-${snapshot.id}`
                  const editingHref = `/?tab=planner&snapshotId=${encodeURIComponent(snapshot.id)}&loadSnapshot=1`

                  return (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <Link
                          href={`/plans/${encodeURIComponent(snapshot.id)}`}
                          className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-foreground hover:underline"
                        >
                          <span className="truncate">{snapshot.label}</span>
                          {snapshot.isActive ? (
                            <Badge variant="default" className="h-5 text-[10px]">
                              Current
                            </Badge>
                          ) : null}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Saved {formatCreatedAt(snapshot.createdAt)}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={pendingAction !== null}
                            aria-label={`Actions for ${snapshot.label}`}
                          >
                            {activating || deleting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/plans/${encodeURIComponent(snapshot.id)}`}>
                              <Eye className="size-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={editingHref}>
                              <Pencil className="size-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          {!snapshot.isActive ? (
                            <DropdownMenuItem
                              disabled={pendingAction !== null}
                              onSelect={(event) => {
                                event.preventDefault()
                                void handleActivate(snapshot)
                              }}
                            >
                              <CheckCircle2 className="size-4" />
                              Set Current
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            disabled={pendingAction !== null}
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => {
                              event.preventDefault()
                              setDeleteTarget(snapshot)
                            }}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meal Plan</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.label || 'this meal plan'}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
              disabled={pendingAction !== null}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pendingAction?.startsWith('delete-') ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster />
    </main>
  )
}
