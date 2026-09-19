/* Bank 1: per-actor interval cache, never allocated for a bullet. The authored
 * velocities are already quantized at build time. Integrating within an
 * interval preserves those integer coordinates exactly; boundaries recompute
 * from the authored origin, including negative offsets and age wrap. */
typedef struct {
    const CE_Motion *motion;
    const CE_Point *point;
    uint16_t age, end, period;
} CE_MotionCursor;
static CE_MotionCursor __at(0xDC80) motion_cursors[CE_MAX_ACTORS];
static uint8_t motion_slot;
static void cgb_move_complex(CE_Entity *e,const CE_Motion *m,uint16_t age) {
    static CE_MotionCursor *c;
    static const CE_Point *p;
    static uint16_t time,t;
    static uint8_t i;
    if(m->kind!=3u || (m->axis&2u)){ce_move_complex(e,m,age);return;}
    c=&motion_cursors[motion_slot];
    if(!age || c->motion!=m){c->motion=m;c->period=m->points[m->count-1u].frame;c->end=0;}
    time=m->loop && c->period ? (c->period==256u?(uint8_t)age:age%c->period) : (age>c->period?c->period:age);
    if(time && time==c->age+1u && time<c->end){
        p=c->point;e->x+=p->vx;e->y+=p->vy;
    } else if(time!=c->age || !c->end || !age){
        i=0;while(i<m->count-2u && time>=m->points[i+1u].frame)++i;
        p=&m->points[i];t=time-p->frame;
        e->x=e->base_x+p->x+p->vx*t;e->y=e->base_y+p->y+p->vy*t;
        c->point=p;c->end=p[1].frame;
    }
    c->age=time;
}
