all:
.SILENT:
.SECONDARY:
PRECMD=echo "  $(@F)" ; mkdir -p $(@D) ;

serve:;http-server -c-1 -a localhost -p 9080 src/www
