# Pseudocode Style Guide

## Purpose

Pseudocode в idea2prd используется для:
1. Точного описания алгоритмов до написания кода
2. Фиксации алгоритмической логики до кодогенерации (логика описана независимо от синтаксиса реализации)
3. Документирования business logic

## Syntax Conventions

### Function Definition

```pseudocode
FUNCTION functionName(param1: Type, param2: Type) -> ReturnType:
    // Function body
END FUNCTION
```

### Aggregate Definition

```pseudocode
AGGREGATE AggregateName

    // State
    STATE:
        id: AggregateId
        status: Status
        items: List<Item>
    END STATE

    // Constructor
    FUNCTION create(...) -> AggregateName:
        ...
    END FUNCTION

    // Commands
    FUNCTION commandMethod(...) -> void:
        ...
    END FUNCTION

    // Queries
    FUNCTION queryMethod(...) -> ReturnType:
        ...
    END FUNCTION

END AGGREGATE
```

### Control Structures

```pseudocode
// Conditionals
IF condition THEN
    action
ELSE IF other_condition THEN
    other_action
ELSE
    default_action
END IF

// Loops
FOR each item IN collection:
    process(item)
END FOR

FOR i FROM 1 TO n:
    process(i)
END FOR

WHILE condition:
    action
END WHILE

// Early returns
IF invalid THEN
    RETURN error
END IF
```

### Validation

```pseudocode
// Pre-conditions at start of function
VALIDATE param IS NOT empty ELSE throw ValidationError("param required")
VALIDATE param.value > 0 ELSE throw ValidationError("must be positive")
VALIDATE user.hasPermission(action) ELSE throw UnauthorizedError

// Post-conditions before return
ENSURE result IS valid
ENSURE result.count > 0
```

### Domain Events

```pseudocode
// Emit domain event
EMIT EventName(
    aggregateId: this.id,
    timestamp: NOW(),
    data: relevant_data
)
```

### External Calls

```pseudocode
// Repository calls
entity = repository.findById(id)
repository.save(entity)

// Service calls
result = externalService.call(params)

// Async operations
ASYNC:
    result = await longRunningOperation()
END ASYNC
```

### Error Handling

```pseudocode
TRY:
    riskyOperation()
CATCH SpecificError AS e:
    handleSpecificError(e)
CATCH:
    handleGenericError()
FINALLY:
    cleanup()
END TRY
```

## Required Sections

Each pseudocode file MUST include:

1. **Pre-conditions** - What must be true before execution
2. **Main logic** - The algorithm steps
3. **Post-conditions** - What must be true after execution
4. **Events** - Domain events emitted

## Example: Complete Aggregate

```pseudocode
// File: OrderAggregate.pseudo

AGGREGATE Order

    STATE:
        id: OrderId
        customerId: CustomerId
        items: List<OrderItem>
        status: OrderStatus  // DRAFT, PLACED, CONFIRMED, SHIPPED, DELIVERED, CANCELLED
        subtotal: Money
        tax: Money
        total: Money
        createdAt: DateTime
        updatedAt: DateTime
    END STATE

    //========================================
    // COMMAND: Place Order
    //========================================
    FUNCTION placeOrder(items: List<OrderItem>, customer: Customer) -> OrderId:
        
        // Pre-conditions
        VALIDATE items IS NOT empty 
            ELSE throw EmptyOrderError("Order must have at least one item")
        
        VALIDATE customer.isVerified 
            ELSE throw UnverifiedCustomerError("Customer must be verified to place orders")
        
        VALIDATE customer.hasValidPaymentMethod 
            ELSE throw NoPaymentMethodError("Customer must have valid payment method")
        
        // Check inventory for all items
        FOR each item IN items:
            available = inventoryService.checkStock(item.productId, item.quantity)
            IF NOT available THEN
                throw OutOfStockError(item.productId, item.quantity)
            END IF
        END FOR
        
        // Calculate totals
        subtotal = 0
        FOR each item IN items:
            subtotal = subtotal + (item.unitPrice * item.quantity)
        END FOR
        
        tax = taxService.calculate(subtotal, customer.shippingAddress.region)
        total = subtotal + tax
        
        // Validate order limits
        VALIDATE total >= MINIMUM_ORDER_AMOUNT 
            ELSE throw MinimumOrderError(MINIMUM_ORDER_AMOUNT)
        
        VALIDATE total <= customer.creditLimit 
            ELSE throw CreditLimitExceededError(customer.creditLimit)
        
        // Create order
        this.id = generateOrderId()
        this.customerId = customer.id
        this.items = items
        this.status = PLACED
        this.subtotal = subtotal
        this.tax = tax
        this.total = total
        this.createdAt = NOW()
        this.updatedAt = NOW()
        
        // Reserve inventory
        FOR each item IN items:
            inventoryService.reserve(item.productId, item.quantity, this.id)
        END FOR
        
        // Post-conditions
        ENSURE this.status == PLACED
        ENSURE this.total == subtotal + tax
        
        // Emit event
        EMIT OrderPlacedEvent(
            orderId: this.id,
            customerId: customer.id,
            items: items.map(i => {productId: i.productId, quantity: i.quantity}),
            total: this.total,
            timestamp: NOW()
        )
        
        RETURN this.id
    END FUNCTION

    //========================================
    // COMMAND: Confirm Order
    //========================================
    FUNCTION confirm(paymentId: PaymentId) -> void:
        
        // Pre-conditions
        VALIDATE this.status == PLACED 
            ELSE throw InvalidStateError("Can only confirm PLACED orders")
        
        VALIDATE paymentId IS NOT null 
            ELSE throw ValidationError("Payment ID required")
        
        // Verify payment
        payment = paymentService.getPayment(paymentId)
        VALIDATE payment.status == SUCCESSFUL 
            ELSE throw PaymentFailedError(paymentId)
        
        VALIDATE payment.amount == this.total 
            ELSE throw PaymentAmountMismatchError(payment.amount, this.total)
        
        // Update state
        this.status = CONFIRMED
        this.paymentId = paymentId
        this.updatedAt = NOW()
        
        // Post-conditions
        ENSURE this.status == CONFIRMED
        
        // Emit event
        EMIT OrderConfirmedEvent(
            orderId: this.id,
            paymentId: paymentId,
            timestamp: NOW()
        )
    END FUNCTION

    //========================================
    // COMMAND: Cancel Order
    //========================================
    FUNCTION cancel(reason: CancellationReason) -> void:
        
        // Pre-conditions
        VALIDATE this.status IN [PLACED, CONFIRMED] 
            ELSE throw InvalidStateError("Cannot cancel order in status: " + this.status)
        
        VALIDATE reason IS NOT null 
            ELSE throw ValidationError("Cancellation reason required")
        
        // Release inventory reservations
        FOR each item IN this.items:
            inventoryService.release(item.productId, item.quantity, this.id)
        END FOR
        
        // Process refund if payment was made
        IF this.status == CONFIRMED AND this.paymentId IS NOT null THEN
            refundId = paymentService.refund(this.paymentId, this.total)
        END IF
        
        // Update state
        previousStatus = this.status
        this.status = CANCELLED
        this.cancellationReason = reason
        this.cancelledAt = NOW()
        this.updatedAt = NOW()
        
        // Post-conditions
        ENSURE this.status == CANCELLED
        
        // Emit event
        EMIT OrderCancelledEvent(
            orderId: this.id,
            previousStatus: previousStatus,
            reason: reason,
            refundId: refundId,  // may be null
            timestamp: NOW()
        )
    END FUNCTION

    //========================================
    // QUERY: Calculate Estimated Delivery
    //========================================
    FUNCTION getEstimatedDelivery() -> DateRange:
        
        // Pre-conditions
        VALIDATE this.status IN [CONFIRMED, SHIPPED] 
            ELSE throw InvalidStateError("No delivery estimate for status: " + this.status)
        
        // Get shipping method
        shippingMethod = this.shippingMethod OR DEFAULT_SHIPPING
        
        // Calculate based on items and destination
        maxLeadTime = 0
        FOR each item IN this.items:
            product = productService.getProduct(item.productId)
            IF product.leadTimeDays > maxLeadTime THEN
                maxLeadTime = product.leadTimeDays
            END IF
        END FOR
        
        transitTime = shippingService.getTransitTime(
            shippingMethod, 
            this.shippingAddress
        )
        
        earliestDate = NOW() + maxLeadTime + transitTime.min
        latestDate = NOW() + maxLeadTime + transitTime.max
        
        RETURN DateRange(earliestDate, latestDate)
    END FUNCTION

END AGGREGATE
```

## Coverage Requirements

| Element | Pseudocode Required |
|---------|---------------------|
| Aggregate command methods | ✅ Always |
| Aggregate factory methods | ✅ Always |
| Domain Service public methods | ✅ Always |
| Complex query methods | ✅ If business logic |
| Simple getters | ❌ Not needed |
| Infrastructure code | ❌ Not needed |

## Integration with Claude Code

When implementing from pseudocode:

```bash
# Reference pseudocode directly
claude "Implement OrderAggregate.placeOrder() in TypeScript following @docs/pseudocode/OrderAggregate.pseudo"

# Generate with specific framework
claude "Convert @docs/pseudocode/OrderAggregate.pseudo to NestJS with TypeORM"
```

## Anti-Patterns to Avoid

❌ **Too vague:**
```pseudocode
FUNCTION placeOrder():
    do stuff
    return order
END FUNCTION
```

❌ **Implementation details:**
```pseudocode
FUNCTION placeOrder():
    const order = new Order()  // Don't use language syntax
    order.id = uuid.v4()       // Don't specify libraries
END FUNCTION
```

✅ **Just right:**
```pseudocode
FUNCTION placeOrder(items, customer) -> OrderId:
    VALIDATE items not empty
    VALIDATE customer.isVerified
    
    FOR each item IN items:
        CHECK inventory.hasStock(item)
    END FOR
    
    total = CALCULATE subtotal + tax
    order = CREATE Order(customer, items, total)
    
    EMIT OrderPlacedEvent(order.id, total)
    RETURN order.id
END FUNCTION
```
