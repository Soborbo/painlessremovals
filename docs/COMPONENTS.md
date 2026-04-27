# UI Components

## Overview

All UI components follow shadcn/ui design patterns with Tailwind CSS styling.

---

## Button
```tsx
import { Button } from '@/components/ui/button';

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">🔥</Button>

// Disabled
<Button disabled>Disabled</Button>
```

---

## Input
```tsx
import { Input } from '@/components/ui/input';

<Input type="text" placeholder="Enter text" />
<Input type="email" placeholder="Email" />
<Input type="password" placeholder="Password" />
<Input error placeholder="Error state" />
<Input disabled placeholder="Disabled" />
```

---

## Card
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    Card content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

---

## Form Field
```tsx
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

<FormField
  label="Email"
  required
  error={errors.email}
  hint="We'll never share your email"
>
  <Input type="email" placeholder="you@example.com" />
</FormField>
```

---

## Progress
```tsx
import { Progress } from '@/components/ui/progress';

<Progress value={50} max={100} />
<Progress value={75} max={100} />
```

---

## Alert
```tsx
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

<Alert variant="default">
  <AlertTitle>Note</AlertTitle>
  <AlertDescription>This is a notification</AlertDescription>
</Alert>

<Alert variant="destructive">
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>Something went wrong</AlertDescription>
</Alert>

<Alert variant="success">
  <AlertTitle>Success</AlertTitle>
  <AlertDescription>Operation completed</AlertDescription>
</Alert>
```

---

## Dialog
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Open Dialog</Button>

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
      <DialogDescription>
        Are you sure you want to continue?
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={() => setOpen(false)}>
        Confirm
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Spinner
```tsx
import { Spinner } from '@/components/ui/spinner';

<Spinner size="sm" />
<Spinner size="md" />
<Spinner size="lg" />
```
