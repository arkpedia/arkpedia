# Base management notes (from the site's base expert, 2026-11-04)

Pasted by the owner on 2026-11-04 as the ground truth for the Base optimizer. Kept verbatim.

There are 4 base management actions that can only be performed when the user is online.
Placing Operators from Dormitory or Available into the Facility Slots
Facilities have 1 to 3 slots and should all be filled up to maximize productivity.
Moving Operators from Facility Slots to Dormitory
1 or more operators from each facility can be moved to dormitory, note that dormitory can house up to 5 operators at a time
Collecting Facility Products
Factories have a maximum capacity of output, trading posts have a maximum number of orders, power plants have a maximum number of drones, and dormitories technically want minimal instances of having full morale operators inside of it. Ideally, whenever the users login, nothing should be at maximum capacity as it means there is wasted production.
Using Drones to Speed Up the Production of Facilities
Drones can be used on one or more desired facilities to increase the products of that facility.

There are three possible desires for what the base produces
Balanced Output
The productivity (percentage of each facility) of all trading posts and factories are cumulated to be the highest possible at a period of time.
LMD Output
The productivity of all trading posts and gold producing factories are cumulated to be the highest possible at the tradeoff of EXP producing factories experiencing less productivity if need be while still being as high as possible.
EXP Output
The productivity of all EXP producing factories are cumulated to be the highest possible at the tradeoff of trading posts and gold producing factories experiencing less productivity if need be.

However, note that this highest possible productivity is only attainable for however long the morales of the best producing operators can last. Thereafter when one or more members run out of energy, they need to be rotated into the dormitory and the next best team to replace them needs to step up. As soon as the best team is fully recovered, they should return to their previous facility to work, to maximise the amount of time the best producing team is working.

There are two ways to maintain the best producing setup of each facility. One is full swap, which is better for people who wants less management or log in less often. This means that all the operators in one facility gets rotated for fresh ones at a time. However, the overall productivity of this may not be the best. The second way is stagger, this means that instead of swapping all three out, you could allow for one or two operators (for example in a three-man facility) to swap out for a weaker fourth/fifth operator. Then when the ones in dormitory recovered, the third operator (or also the second) that have yet to enter the base can swap with them. This ensures a high maintenance of the best productivity but is definitely more meticulous. Note that operators do not have to be swapped out when their morale hits zero, and can be swapped out before it if it ensures higher productivity.

Users typically log in 24 hours, 12 hours or 8 hours a day. We need to account for this behaviour. 24 hour log ins cannot afford to have the highest best productivity as their capacity will definitely be capped, so they need to balance out with capacity increasing operators as well. Whereas 12 and 8 can have easier timings to do better swaps or even the staggering method.

In order to decide the best operators to use, there are ways to determine this

The combination of operators that produces the highest productivity is prioritised first. This might need them to be conditionally affected by operators placed in the same facility, in the dormitories, other facilities or the control center and must be accounted for. When one or more combination of operators can fill the highest productivity there is then a prioritisation order.

Operator with the least dependencies (can exist alone to have the high productivity)
Operator with internal dependencies (needs one or more people in the same facility to achieve the higher amount)
Operator with facility level dependencies (needs the level of trading posts, factories or power plants to achieve the higher amount)
Operator with external dependencies (needs one or more people from other facilities to achieve the higher amount, which may result in lower productivity in those facilities)
Operator with the need for control center operators to exist

As you can see the prioritisation order has more dependencies as it goes down the list, meaning that more units must be placed in which can lower the overall productivity for the sake of one facility. However, if done well, it may instead produce the highest single facility productivity and could also be the best one for the overall of the base. Hence why highest productivity is prioritised first, followed by the ones with the same going through that order list.
