variable "environment"         { type = string }
variable "vpc_id"              { type = string }
variable "subnet_ids"          { type = list(string) }
variable "eks_security_group"  { type = string }
variable "instance_class"      { type = string }
variable "allocated_storage"   { type = number }
variable "master_password"     { type = string; sensitive = true }
variable "tags"                { type = map(string) }
